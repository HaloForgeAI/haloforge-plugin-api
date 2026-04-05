import { useContext, createContext, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  UsePluginSettingsReturn,
  UseAppThemeReturn,
  HostDataResource,
  UseHostDataReturn,
  NotifyOptions,
  AppTheme,
} from "./types";

// ─── Plugin context (injected by host) ───────────────────────────────────────

interface PluginRuntimeContext {
  pluginId: string;
  slotId: string;
  slotContext: Record<string, unknown>;
}

/** @internal — provided by the host's PluginSlot component */
export const PluginRuntimeContext = createContext<PluginRuntimeContext>({
  pluginId: "",
  slotId: "",
  slotContext: {},
});

/** Access the slot context data injected by the host. */
export function useSlotContext<T = Record<string, unknown>>(): T {
  return useContext(PluginRuntimeContext).slotContext as T;
}

/** Read the current plugin's ID and slot ID. */
export function usePluginInfo(): { id: string; slotId: string } {
  const ctx = useContext(PluginRuntimeContext);
  return { id: ctx.pluginId, slotId: ctx.slotId };
}

// ─── Plugin settings ──────────────────────────────────────────────────────────

/**
 * Read and update settings for this plugin.
 * Settings are stored in the DB and survive restarts.
 *
 * @example
 * ```tsx
 * const { settings, updateSettings } = usePluginSettings<{ apiKey: string }>();
 * ```
 */
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

/**
 * Read the currently active HaloForge theme.
 * Re-renders whenever the user changes the theme.
 */
export function useAppTheme(): UseAppThemeReturn {
  const [theme, setTheme] = useState<AppTheme>({
    id: "forge-dark",
    name: "Forge Dark",
    type: "dark",
    colors: {},
  });

  useEffect(() => {
    // Read CSS variables from the document root
    const readCssVars = () => {
      const style = getComputedStyle(document.documentElement);
      const varNames = [
        "--color-primary", "--color-background", "--color-surface",
        "--color-foreground", "--color-border", "--color-sidebar",
      ];
      const colors: Record<string, string> = {};
      for (const name of varNames) {
        colors[name] = style.getPropertyValue(name).trim();
      }
      setTheme((t) => ({ ...t, colors }));
    };

    readCssVars();

    const unlisten = listen("theme:changed", readCssVars);
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return {
    theme,
    cssVars: theme.colors,
  };
}

// ─── Host data access ─────────────────────────────────────────────────────────

const HOST_DATA_COMMANDS: Record<HostDataResource, string> = {
  "devkit.profiles":    "devkit_get_profiles",
  "devkit.workflows":   "devkit_get_workflows",
  "devkit.snippets":    "devkit_get_snippets",
  "devkit.directories": "devkit_get_directories",
  "aichat.sessions":    "aichat_get_sessions",
  "aichat.models":      "aichat_get_model_configs",
};

/**
 * Read host app data. Requires the matching `database:read:*` permission.
 *
 * @example
 * ```tsx
 * const { data: profiles } = useHostData("devkit.profiles");
 * ```
 */
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

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
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

let _toastEmitter: ((opts: NotifyOptions) => void) | null = null;

/** @internal — called by the host to wire up the toast system */
export function _setToastEmitter(fn: (opts: NotifyOptions) => void): void {
  _toastEmitter = fn;
}

/**
 * Show a toast notification in the HaloForge UI.
 */
export function notify(options: NotifyOptions): void {
  if (_toastEmitter) {
    _toastEmitter(options);
  } else {
    console.info(`[plugin toast] ${options.title}: ${options.message}`);
  }
}

// ─── App events ───────────────────────────────────────────────────────────────

/**
 * Subscribe to a HaloForge app event.
 * Automatically unsubscribes when the component unmounts.
 *
 * @example
 * ```tsx
 * useAppEvent("workflow:step_update", (payload) => console.log(payload));
 * ```
 */
export function useAppEvent(
  event: string,
  handler: (payload: unknown) => void,
): void {
  useEffect(() => {
    const unlisten = listen(event, (e) => handler(e.payload));
    return () => { unlisten.then((fn) => fn()); };
  }, [event, handler]);
}

/**
 * Emit a plugin-scoped event.
 */
export function emitPluginEvent(event: string, payload: unknown): void {
  const { pluginId } = useContext(PluginRuntimeContext) as PluginRuntimeContext;
  invoke("plugin_invoke", {
    args: {
      wire_name: `plugin_${pluginId.replace(/[.\-]/g, "_")}_emit_event`,
      args: { event, payload },
    },
  }).catch(() => {}); // best-effort
}
