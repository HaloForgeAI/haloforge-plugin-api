import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { _getPluginId, invokeHost, pluginCurrentWindow, pluginDeepLinks, pluginNavigation, pluginWindows, watchHostFile } from "./ipc";
import type {
  AppTheme,
  HostAIRequest,
  HostDataResource,
  HostFileChangeEvent,
  HostFileDialogOptions,
  HostFileIntent,
  HostNavigationApi,
  NotifyOptions,
  PluginDeepLink,
  PluginCurrentWindowApi,
  PluginLogger,
  PluginLogLevel,
  PluginLogOptions,
  PluginNavigationOptions,
  PluginRouteChange,
  PluginWindowApi,
  PluginWindowTitleOptions,
  UseAppThemeReturn,
  UseHostAIReturn,
  UseHostDataReturn,
  UseHostFileIntentReturn,
  UseHostFileWatchOptions,
  UseHostModelsReturn,
  UsePluginNavigationReturn,
  UsePluginSettingsReturn,
} from "./types";

// ─── Plugin context (injected by host) ───────────────────────────────────────

interface PluginRuntimeContextValue {
  pluginId: string;
  slotId: string;
  slotContext: Record<string, unknown>;
  moduleId?: string | null;
}

/** @internal — provided by the host's PluginSlot component */
export const PluginRuntimeContext = createContext<PluginRuntimeContextValue>({
  pluginId: "",
  slotId: "",
  slotContext: {},
  moduleId: null,
});

/** Access the slot context data injected by the host. */
export function useSlotContext<T = Record<string, unknown>>(): T {
  return useContext(PluginRuntimeContext).slotContext as T;
}

/** Read the current plugin's ID and slot ID. */
export function usePluginInfo(): { id: string; slotId: string; moduleId: string | null } {
  const ctx = useContext(PluginRuntimeContext);
  return { id: ctx.pluginId, slotId: ctx.slotId, moduleId: ctx.moduleId ?? null };
}

// ─── Plugin settings ──────────────────────────────────────────────────────────

export function usePluginSettings<T = Record<string, unknown>>(): UsePluginSettingsReturn<T> {
  const { pluginId } = useContext(PluginRuntimeContext);
  const [settings, setSettings] = useState<T>({} as T);

  useEffect(() => {
    if (!pluginId) return;
    invoke<T>("plugin_get_settings", { pluginId })
      .then(setSettings)
      .catch(console.error);
  }, [pluginId]);

  const updateSettings = useCallback(
    async (patch: Partial<T>) => {
      const next = { ...settings, ...patch };
      await invoke("plugin_save_settings", { pluginId, settings: next });
      setSettings(next);
    },
    [pluginId, settings],
  );

  return { settings, updateSettings };
}

// ─── App theme ────────────────────────────────────────────────────────────────

export function useAppTheme(): UseAppThemeReturn {
  const [theme, setTheme] = useState<AppTheme>({
    id: "forge-dark",
    name: "Forge Dark",
    type: "dark",
    colors: {},
  });

  useEffect(() => {
    const readCssVars = () => {
      const style = getComputedStyle(document.documentElement);
      const varNames = [
        "--color-primary",
        "--color-background",
        "--color-surface",
        "--color-foreground",
        "--color-border",
        "--color-sidebar",
      ];
      const colors: Record<string, string> = {};
      for (const name of varNames) {
        colors[name] = style.getPropertyValue(name).trim();
      }
      setTheme((current) => ({ ...current, colors }));
    };

    readCssVars();

    const unlisten = listen("theme:changed", readCssVars);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return {
    theme,
    cssVars: theme.colors,
  };
}

export function useHostTheme(): UseAppThemeReturn {
  return useAppTheme();
}

// ─── Host bridge (SDK-managed compatibility layer) ──────────────────────────

interface HostAppSnapshot {
  activeModule?: string;
  activeSettingsTab?: string | null;
  pendingFileIntent?: HostFileIntent | null;
  pendingMarkdownOpenPath?: string | null;
}

interface HostAIChatSnapshot<TModel = Record<string, unknown>> {
  modelConfigs?: TModel[];
  selectedModelId?: string | null;
}

interface HostBridge {
  app?: {
    getSnapshot?: () => HostAppSnapshot;
    setActiveModule?: (module: string) => void;
    openSettingsTab?: (tab: string) => void;
    setPendingFileIntent?: (intent: HostFileIntent | null) => void;
    clearPendingFileIntent?: () => void;
    setPendingMarkdownOpenPath?: (path: string | null) => void;
    clearPendingMarkdownOpenPath?: () => void;
  };
  aichat?: {
    fetchModelConfigs?: () => Promise<void>;
    getSnapshot?: () => HostAIChatSnapshot;
    setSelectedModelId?: (id: string | null) => void;
  };
}

function getHostBridge(): HostBridge {
  return (window as typeof window & { __HF_HOST?: HostBridge }).__HF_HOST ?? {};
}

function normalizeFileIntent(snapshot: HostAppSnapshot): HostFileIntent | null {
  if (snapshot.pendingFileIntent && typeof snapshot.pendingFileIntent.path === "string") {
    return snapshot.pendingFileIntent;
  }

  if (typeof snapshot.pendingMarkdownOpenPath === "string" && snapshot.pendingMarkdownOpenPath) {
    return {
      kind: "open",
      path: snapshot.pendingMarkdownOpenPath,
      source: "legacy-markdown-open",
    };
  }

  return null;
}

type InternalHostAppState = {
  activeModule: string;
  activeSettingsTab: string | null;
  pendingFileIntent: HostFileIntent | null;
};

const hostAppListeners = new Set<() => void>();
let hostAppTimer: number | null = null;
const hostAppState: InternalHostAppState = {
  activeModule: "devkit",
  activeSettingsTab: null,
  pendingFileIntent: null,
};

function emitHostAppChange() {
  hostAppListeners.forEach((listener) => listener());
}

function syncHostAppFromBridge() {
  const snapshot = getHostBridge().app?.getSnapshot?.();
  if (!snapshot) {
    return;
  }

  let changed = false;
  if (typeof snapshot.activeModule === "string" && snapshot.activeModule !== hostAppState.activeModule) {
    hostAppState.activeModule = snapshot.activeModule;
    changed = true;
  }
  if (
    (typeof snapshot.activeSettingsTab === "string" || snapshot.activeSettingsTab === null)
    && snapshot.activeSettingsTab !== hostAppState.activeSettingsTab
  ) {
    hostAppState.activeSettingsTab = snapshot.activeSettingsTab ?? null;
    changed = true;
  }

  const nextIntent = normalizeFileIntent(snapshot);
  if (JSON.stringify(nextIntent) !== JSON.stringify(hostAppState.pendingFileIntent)) {
    hostAppState.pendingFileIntent = nextIntent;
    changed = true;
  }

  if (changed) {
    emitHostAppChange();
  }
}

function startHostAppPolling() {
  if (hostAppTimer !== null) {
    return;
  }
  hostAppTimer = window.setInterval(syncHostAppFromBridge, 300);
}

function stopHostAppPolling() {
  if (hostAppTimer === null || hostAppListeners.size > 0) {
    return;
  }
  window.clearInterval(hostAppTimer);
  hostAppTimer = null;
}

function subscribeHostApp(listener: () => void) {
  hostAppListeners.add(listener);
  syncHostAppFromBridge();
  startHostAppPolling();
  return () => {
    hostAppListeners.delete(listener);
    stopHostAppPolling();
  };
}

function getHostAppSnapshot() {
  syncHostAppFromBridge();
  return hostAppState;
}

function setPendingFileIntent(intent: HostFileIntent | null) {
  const hostApp = getHostBridge().app;
  if (hostApp?.setPendingFileIntent) {
    hostApp.setPendingFileIntent(intent);
  } else if (intent && hostApp?.setPendingMarkdownOpenPath) {
    hostApp.setPendingMarkdownOpenPath(intent.path);
  } else if (!intent && hostApp?.clearPendingFileIntent) {
    hostApp.clearPendingFileIntent();
  } else if (!intent && hostApp?.clearPendingMarkdownOpenPath) {
    hostApp.clearPendingMarkdownOpenPath();
  }

  hostAppState.pendingFileIntent = intent;
  emitHostAppChange();
}

function clearPendingFileIntent() {
  setPendingFileIntent(null);
}

type InternalHostAIState<TModel = Record<string, unknown>> = {
  modelConfigs: TModel[];
  selectedModelId: string | null;
};

const hostAIListeners = new Set<() => void>();
let hostAITimer: number | null = null;
const hostAIState: InternalHostAIState = {
  modelConfigs: [],
  selectedModelId: null,
};

function emitHostAIChange() {
  hostAIListeners.forEach((listener) => listener());
}

function syncHostAIFromBridge() {
  const snapshot = getHostBridge().aichat?.getSnapshot?.();
  if (!snapshot) {
    return;
  }

  let changed = false;
  if (Array.isArray(snapshot.modelConfigs) && snapshot.modelConfigs !== hostAIState.modelConfigs) {
    hostAIState.modelConfigs = snapshot.modelConfigs;
    changed = true;
  }
  if (
    (typeof snapshot.selectedModelId === "string" || snapshot.selectedModelId === null)
    && snapshot.selectedModelId !== hostAIState.selectedModelId
  ) {
    hostAIState.selectedModelId = snapshot.selectedModelId ?? null;
    changed = true;
  }

  if (changed) {
    emitHostAIChange();
  }
}

function startHostAIPolling() {
  if (hostAITimer !== null) {
    return;
  }
  hostAITimer = window.setInterval(syncHostAIFromBridge, 300);
}

function stopHostAIPolling() {
  if (hostAITimer === null || hostAIListeners.size > 0) {
    return;
  }
  window.clearInterval(hostAITimer);
  hostAITimer = null;
}

function subscribeHostAI(listener: () => void) {
  hostAIListeners.add(listener);
  syncHostAIFromBridge();
  startHostAIPolling();
  return () => {
    hostAIListeners.delete(listener);
    stopHostAIPolling();
  };
}

function getHostAISnapshot() {
  syncHostAIFromBridge();
  return hostAIState;
}

// ─── Public host hooks ───────────────────────────────────────────────────────

export function useHostAppState(): {
  activeModule: string;
  activeSettingsTab: string | null;
} {
  const snapshot = useSyncExternalStore(subscribeHostApp, getHostAppSnapshot, getHostAppSnapshot);
  return {
    activeModule: snapshot.activeModule,
    activeSettingsTab: snapshot.activeSettingsTab,
  };
}

export function useHostNavigation(): HostNavigationApi {
  const snapshot = useSyncExternalStore(subscribeHostApp, getHostAppSnapshot, getHostAppSnapshot);

  const navigateToModule = useCallback((moduleId: string) => {
    getHostBridge().app?.setActiveModule?.(moduleId);
    hostAppState.activeModule = moduleId;
    emitHostAppChange();
  }, []);

  const openSettingsTab = useCallback((tabId: string) => {
    const hostApp = getHostBridge().app;
    if (hostApp?.openSettingsTab) {
      hostApp.openSettingsTab(tabId);
    } else {
      hostApp?.setActiveModule?.("settings");
    }
    hostAppState.activeModule = "settings";
    hostAppState.activeSettingsTab = tabId;
    emitHostAppChange();
  }, []);

  return {
    activeModule: snapshot.activeModule,
    activeSettingsTab: snapshot.activeSettingsTab,
    navigateToModule,
    openSettingsTab,
  };
}

export function useHostFileIntent(): UseHostFileIntentReturn {
  const snapshot = useSyncExternalStore(subscribeHostApp, getHostAppSnapshot, getHostAppSnapshot);

  return {
    intent: snapshot.pendingFileIntent,
    setIntent: setPendingFileIntent,
    consume: clearPendingFileIntent,
  };
}

export function usePluginDeepLink(
  handler?: (link: PluginDeepLink) => void,
): PluginDeepLink | null {
  const [pending, setPending] = useState<PluginDeepLink | null>(() => {
    try {
      return pluginDeepLinks().getPending();
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let api: ReturnType<typeof pluginDeepLinks>;
    try {
      api = pluginDeepLinks();
    } catch (error) {
      console.warn("[plugin-sdk] usePluginDeepLink unavailable:", error);
      return;
    }

    const current = api.getPending();
    setPending(current);
    if (current && handler) {
      handler(current);
    }

    return api.onOpen((link) => {
      setPending(link);
      handler?.(link);
    });
  }, [handler]);

  return pending;
}

export function usePluginNavigation(): UsePluginNavigationReturn {
  const { moduleId } = useContext(PluginRuntimeContext);
  const [current, setCurrent] = useState<PluginRouteChange | null>(() => {
    try {
      return pluginNavigation().getCurrent(moduleId ?? null);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let api: ReturnType<typeof pluginNavigation>;
    try {
      api = pluginNavigation();
    } catch (error) {
      console.warn("[plugin-sdk] usePluginNavigation unavailable:", error);
      return;
    }

    setCurrent(api.getCurrent(moduleId ?? null));
    return api.onRouteChange((change) => {
      if (moduleId && change.moduleId !== moduleId) {
        return;
      }
      setCurrent(change);
    });
  }, [moduleId]);

  const getCurrent = useCallback((targetModuleId?: string | null) => {
    return pluginNavigation().getCurrent(targetModuleId ?? moduleId ?? null);
  }, [moduleId]);

  const pushRoute = useCallback((route: string, options?: PluginNavigationOptions) => {
    const change = pluginNavigation().pushRoute(route, {
      ...options,
      moduleId: options?.moduleId ?? moduleId ?? null,
    });
    setCurrent(change);
    return change;
  }, [moduleId]);

  const replaceRoute = useCallback((route: string, options?: PluginNavigationOptions) => {
    const change = pluginNavigation().replaceRoute(route, {
      ...options,
      moduleId: options?.moduleId ?? moduleId ?? null,
    });
    setCurrent(change);
    return change;
  }, [moduleId]);

  const onRouteChange = useCallback((handler: (change: PluginRouteChange) => void) => {
    return pluginNavigation().onRouteChange((change) => {
      if (moduleId && change.moduleId !== moduleId) {
        return;
      }
      handler(change);
    });
  }, [moduleId]);

  return {
    current,
    getCurrent,
    pushRoute,
    replaceRoute,
    onRouteChange,
  };
}

export function usePluginWindows(): PluginWindowApi {
  return pluginWindows();
}

export function usePluginCurrentWindow(): PluginCurrentWindowApi {
  return pluginCurrentWindow();
}

export function usePluginWindowTitle(
  title: string | null | undefined,
  options: PluginWindowTitleOptions = {},
): void {
  const { moduleId } = useContext(PluginRuntimeContext);
  const targetModuleId = options.moduleId ?? moduleId ?? null;
  const subtitle = options.subtitle ?? null;

  useEffect(() => {
    let api: ReturnType<typeof pluginCurrentWindow>;
    try {
      api = pluginCurrentWindow();
    } catch (error) {
      console.warn("[plugin-sdk] usePluginWindowTitle unavailable:", error);
      return;
    }

    const normalizedTitle = title?.trim();
    if (normalizedTitle) {
      void api.setTitle(normalizedTitle, {
        moduleId: targetModuleId,
        subtitle,
      });
    } else {
      void api.resetTitle({ moduleId: targetModuleId });
    }

    return () => {
      void api.resetTitle({ moduleId: targetModuleId });
    };
  }, [targetModuleId, subtitle, title]);
}

export function useHostModels<TModel = Record<string, unknown>>(): UseHostModelsReturn<TModel> {
  const snapshot = useSyncExternalStore(subscribeHostAI, getHostAISnapshot, getHostAISnapshot);

  const refresh = useCallback(async () => {
    await getHostBridge().aichat?.fetchModelConfigs?.();
    syncHostAIFromBridge();
  }, []);

  const selectModel = useCallback((id: string | null) => {
    getHostBridge().aichat?.setSelectedModelId?.(id);
    hostAIState.selectedModelId = id;
    emitHostAIChange();
  }, []);

  return {
    models: snapshot.modelConfigs as TModel[],
    selectedModelId: snapshot.selectedModelId,
    selectModel,
    refresh,
  };
}

export function useAvailableModels<TModel = Record<string, unknown>>(): UseHostModelsReturn<TModel> {
  return useHostModels<TModel>();
}

export function useHostAI<
  TModel = Record<string, unknown>,
  TResult = unknown,
>(): UseHostAIReturn<TModel, TResult> {
  const { models, selectedModelId, selectModel, refresh } = useHostModels<TModel>();

  const sendMessage = useCallback(async (request: string | HostAIRequest): Promise<TResult> => {
    const normalizedRequest = typeof request === "string" ? { content: request } : request;
    return invoke<TResult>("aichat_send_message", { request: normalizedRequest });
  }, []);

  const stopGeneration = useCallback(async () => {
    return invoke<boolean>("aichat_stop_generation");
  }, []);

  const createSession = useCallback(async <TSession = unknown>(session: TSession): Promise<TSession> => {
    return invoke<TSession>("aichat_create_session", { session });
  }, []);

  const getStreamState = useCallback(async <TStreamState = unknown>(sessionId: string): Promise<TStreamState | null> => {
    return invoke<TStreamState | null>("aichat_get_stream_state", { sessionId });
  }, []);

  return {
    models,
    selectedModelId,
    selectModel,
    refresh,
    sendMessage,
    stopGeneration,
    createSession,
    getStreamState,
  };
}

export async function pickHostFile(options: HostFileDialogOptions = {}): Promise<string | null> {
  return invokeHost<string | null>("devkit_pick_file", {
    title: options.title ?? null,
    directory: options.directory ?? null,
    filters: options.filters ?? null,
  });
}

export async function pickHostDirectory(options: HostFileDialogOptions = {}): Promise<string | null> {
  return invokeHost<string | null>("devkit_pick_directory", {
    title: options.title ?? null,
    directory: options.directory ?? null,
  });
}

export async function saveHostFile(options: HostFileDialogOptions = {}): Promise<string | null> {
  return invokeHost<string | null>("devkit_save_file", {
    title: options.title ?? null,
    directory: options.directory ?? null,
    defaultName: options.defaultName ?? null,
    filters: options.filters ?? null,
  });
}

// ─── Host data access ─────────────────────────────────────────────────────────

const HOST_DATA_COMMANDS: Record<HostDataResource, string> = {
  "devkit.profiles": "devkit_get_profiles",
  "devkit.workflows": "devkit_get_workflows",
  "devkit.snippets": "devkit_get_snippets",
  "devkit.directories": "devkit_get_directories",
  "aichat.sessions": "aichat_get_sessions",
  "aichat.models": "aichat_get_model_configs",
};

export function useHostData<T = unknown>(resource: HostDataResource): UseHostDataReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<T[]>(HOST_DATA_COMMANDS[resource]);
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [resource]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: () => void fetch() };
}

// ─── Plugin storage (lightweight KV) ─────────────────────────────────────────

const storage = new Map<string, unknown>();

export function usePluginStorage() {
  return {
    get: <T>(key: string): T | undefined => storage.get(key) as T | undefined,
    set: (key: string, value: unknown) => storage.set(key, value),
    remove: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  };
}

// ─── Notifications ────────────────────────────────────────────────────────────

let toastEmitter: ((opts: NotifyOptions) => void) | null = null;

export function _setToastEmitter(fn: (opts: NotifyOptions) => void): void {
  toastEmitter = fn;
}

export function notify(options: NotifyOptions): void {
  if (toastEmitter) {
    toastEmitter(options);
  } else {
    console.info(`[plugin toast] ${options.title}: ${options.message}`);
  }
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function pluginLogScope(scope?: string): string {
  const pluginId = _getPluginId();
  const base = pluginId ? `plugin:${pluginId}` : "plugin";
  const suffix = scope?.trim();
  return suffix ? `${base}:${suffix}` : base;
}

function consoleForLogLevel(level: PluginLogLevel): (...args: unknown[]) => void {
  if (level === "error") return console.error;
  if (level === "warn") return console.warn;
  if (level === "debug") return console.debug;
  return console.info;
}

export async function log(
  levelOrOptions: PluginLogLevel | PluginLogOptions,
  message?: string,
  details?: unknown,
  scope?: string,
): Promise<void> {
  const options: PluginLogOptions = typeof levelOrOptions === "string"
    ? { level: levelOrOptions, message: message ?? "", details, scope }
    : levelOrOptions;
  const level = options.level ?? "info";
  const resolvedScope = pluginLogScope(options.scope);
  const resolvedMessage = options.message.trim() || "Plugin log event";

  try {
    await invoke("frontend_log_event", {
      level,
      scope: resolvedScope,
      message: resolvedMessage,
      details: options.details ?? null,
    });
  } catch (error) {
    consoleForLogLevel(level)(`[${resolvedScope}] ${resolvedMessage}`, options.details ?? "", error);
  }
}

export function createPluginLogger(scope?: string): PluginLogger {
  return {
    trace: (message, details) => log("trace", message, details, scope),
    debug: (message, details) => log("debug", message, details, scope),
    info: (message, details) => log("info", message, details, scope),
    warn: (message, details) => log("warn", message, details, scope),
    error: (message, details) => log("error", message, details, scope),
  };
}

// ─── App events ───────────────────────────────────────────────────────────────

export function useAppEvent(
  event: string,
  handler: (payload: unknown) => void,
): void {
  useEffect(() => {
    const unlisten = listen(event, (e) => handler(e.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [event, handler]);
}

export function useHostEvent(
  event: string,
  handler: (payload: unknown) => void,
): void {
  useAppEvent(event, handler);
}

export function useHostFileWatch(
  path: string | null | undefined,
  handler: (event: HostFileChangeEvent) => void,
  options: UseHostFileWatchOptions = {},
): void {
  const handlerRef = useRef(handler);
  const onErrorRef = useRef(options.onError);
  const enabled = options.enabled ?? true;
  handlerRef.current = handler;
  onErrorRef.current = options.onError;

  useEffect(() => {
    if (!enabled || !path) {
      return;
    }

    let disposed = false;
    let stopWatching: (() => Promise<void>) | null = null;
    const reportError = (error: unknown) => {
      if (disposed) {
        return;
      }
      if (onErrorRef.current) {
        onErrorRef.current(error);
      } else {
        console.warn("[plugin-sdk] useHostFileWatch failed:", error);
      }
    };

    void watchHostFile(path, (event) => handlerRef.current(event))
      .then((stop) => {
        if (disposed) {
          void stop().catch(reportError);
          return;
        }
        stopWatching = stop;
      })
      .catch(reportError);

    return () => {
      disposed = true;
      if (stopWatching) {
        void stopWatching().catch(reportError);
      }
    };
  }, [enabled, path]);
}

export async function emitPluginEvent(event: string, payload: unknown): Promise<void> {
  const pluginId = _getPluginId();
  if (!pluginId) {
    throw new Error("[plugin-sdk] emitPluginEvent: plugin ID not set. Did you call registerPlugin()?");
  }

  await invoke("plugin_invoke", {
    args: {
      wire_name: `plugin_${pluginId.replace(/[.\-]/g, "_")}_emit_event`,
      args: { event, payload },
    },
  });
}
