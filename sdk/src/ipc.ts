import { invoke } from "@tauri-apps/api/core";
import type {
  EnterpriseGatewayApi,
  GatewayImageGenerationResult,
  GatewayOutputAssetList,
  HostFileChangeEvent,
  HostFileWatchApi,
  PluginDeepLink,
  PluginDeepLinkApi,
  PluginCurrentWindowApi,
  PluginGatewayImageEditRequest,
  PluginGatewayImageRequest,
  PluginNavigationApi,
  PluginNavigationOptions,
  PluginResourceOpenOptions,
  PluginRouteChange,
  PluginWindowApi,
  PluginWindowOpenOptions,
  PluginWindowOpenResult,
  StopHostFileWatch,
} from "./types";

// ─── Plugin-scoped IPC ────────────────────────────────────────────────────────

let _currentPluginId = "";

/** @internal Called once by the plugin runtime to set the current plugin context. */
export function _setPluginId(id: string): void {
  _currentPluginId = id;
}

/** @internal Exposed for SDK helpers that cannot rely on React context. */
export function _getPluginId(): string {
  return _currentPluginId;
}

/**
 * Call a Tauri command registered by this plugin's Rust backend.
 * The command name is automatically prefixed: `plugin_{id}_{command}`.
 *
 * @example
 * ```ts
 * const status = await invokePlugin<GitStatus>("git_status", { path: "/repo" });
 * ```
 */
export async function invokePlugin<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!_currentPluginId) {
    throw new Error("[plugin-sdk] invokePlugin: plugin ID not set. Did you call registerPlugin()?");
  }
  const wireName = `plugin_${_currentPluginId.replace(/[.\-]/g, "_")}_${command}`;
  return invoke<T>("plugin_invoke", {
    args: { wire_name: wireName, args: args ?? {} },
  });
}

/**
 * Call a command registered by another plugin.
 * Use this to depend on services provided by another plugin.
 */
export async function invokeOtherPlugin<T = unknown>(
  targetPluginId: string,
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const wireName = `plugin_${targetPluginId.replace(/[.\-]/g, "_")}_${command}`;
  return invoke<T>("plugin_invoke", {
    args: { wire_name: wireName, args: args ?? {} },
  });
}

/**
 * Call a built-in HaloForge host Tauri command directly.
 * Only available if declared in manifest permissions.
 */
export async function invokeHost<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(command, args);
}

interface HaloForgePluginHostBridge {
  version: 1;
  deepLinks?: {
    getPending: (pluginId?: string) => PluginDeepLink | null;
    clearPending: (pluginId?: string) => void;
    onOpen: (
      pluginId: string,
      handler: (request: PluginDeepLink) => void,
    ) => () => void;
  };
  navigation?: {
    getCurrent: (pluginId: string, moduleId?: string | null) => PluginRouteChange | null;
    pushRoute: (
      pluginId: string,
      request: { moduleId?: string | null; route?: string | null; params?: Record<string, string> | null },
    ) => PluginRouteChange;
    replaceRoute: (
      pluginId: string,
      request: { moduleId?: string | null; route?: string | null; params?: Record<string, string> | null },
    ) => PluginRouteChange;
    onRouteChange: (
      pluginId: string,
      handler: (request: PluginRouteChange) => void,
    ) => () => void;
  };
  windows?: {
    openPluginRoute: (
      pluginId: string,
      request: {
        moduleId?: string | null;
        route?: string | null;
        params?: Record<string, string> | null;
        openMode?: string | null;
        reuseKey?: string | null;
        allowMultiple?: boolean | null;
        resource?: string | null;
      },
    ) => Promise<PluginWindowOpenResult>;
    openResource: (
      pluginId: string,
      request: {
        moduleId?: string | null;
        route?: string | null;
        params?: Record<string, string> | null;
        openMode?: string | null;
        reuseKey?: string | null;
        allowMultiple?: boolean | null;
        resource: string;
      },
    ) => Promise<PluginWindowOpenResult>;
  };
  currentWindow?: {
    setTitle: (
      pluginId: string,
      request: {
        moduleId?: string | null;
        title?: string | null;
        subtitle?: string | null;
      },
    ) => Promise<void>;
    resetTitle: (
      pluginId: string,
      request?: {
        moduleId?: string | null;
      },
    ) => Promise<void>;
  };
  files?: {
    watch: (
      pluginId: string,
      path: string,
      handler: (event: HostFileChangeEvent) => void,
    ) => Promise<StopHostFileWatch>;
  };
  enterpriseGateway?: {
    generateImages: (
      pluginId: string,
      request: PluginGatewayImageRequest,
    ) => Promise<GatewayImageGenerationResult>;
    editImages: (
      pluginId: string,
      request: PluginGatewayImageEditRequest,
    ) => Promise<GatewayImageGenerationResult>;
    listOutputs: (
      pluginId: string,
      limit?: number,
    ) => Promise<GatewayOutputAssetList>;
  };
}

function getPluginHostBridge(): HaloForgePluginHostBridge | null {
  const bridge = (window as typeof window & {
    __HALOFORGE_PLUGIN_HOST__?: HaloForgePluginHostBridge;
  }).__HALOFORGE_PLUGIN_HOST__;
  return bridge?.version === 1 ? bridge : null;
}

function requireCurrentPluginId(feature: string): string {
  if (!_currentPluginId) {
    throw new Error(`[plugin-sdk] ${feature}: plugin ID not set. Did you call registerPlugin()?`);
  }
  return _currentPluginId;
}

function requireEnterpriseGateway() {
  const gateway = getPluginHostBridge()?.enterpriseGateway;
  if (!gateway) {
    throw new Error("[plugin-sdk] enterpriseGateway: host managed image gateway bridge is unavailable.");
  }
  return gateway;
}

function requireDeepLinks() {
  const deepLinks = getPluginHostBridge()?.deepLinks;
  if (!deepLinks) {
    throw new Error("[plugin-sdk] pluginDeepLinks: host deep link bridge is unavailable.");
  }
  return deepLinks;
}

function requireNavigation() {
  const navigation = getPluginHostBridge()?.navigation;
  if (!navigation) {
    throw new Error("[plugin-sdk] pluginNavigation: host navigation bridge is unavailable.");
  }
  return navigation;
}

function requireWindows() {
  const windows = getPluginHostBridge()?.windows;
  if (!windows) {
    throw new Error("[plugin-sdk] pluginWindows: host window bridge is unavailable.");
  }
  return windows;
}

function requireCurrentWindow() {
  const currentWindow = getPluginHostBridge()?.currentWindow;
  if (!currentWindow) {
    throw new Error("[plugin-sdk] pluginCurrentWindow: host current-window bridge is unavailable.");
  }
  return currentWindow;
}

function requireFiles() {
  const files = getPluginHostBridge()?.files;
  if (!files) {
    throw new Error("[plugin-sdk] pluginFiles: host file watch bridge is unavailable.");
  }
  return files;
}

/**
 * Subscribe to `haloforge://plugin/<plugin-id>/...` launch URLs routed to this plugin.
 *
 * The host opens the target plugin module first, then delivers the URL through this
 * SDK surface. Plugins may ignore this helper when they do not support imports or
 * other external launch actions.
 */
export function pluginDeepLinks(): PluginDeepLinkApi {
  const pluginId = requireCurrentPluginId("pluginDeepLinks");
  const deepLinks = requireDeepLinks();
  return {
    getPending: () => deepLinks.getPending(pluginId),
    clearPending: () => deepLinks.clearPending(pluginId),
    onOpen: (handler) => deepLinks.onOpen(pluginId, handler),
  };
}

export function getPendingPluginDeepLink(): PluginDeepLink | null {
  return pluginDeepLinks().getPending();
}

export function clearPendingPluginDeepLink(): void {
  pluginDeepLinks().clearPending();
}

export function onPluginDeepLink(
  handler: (link: PluginDeepLink) => void,
): () => void {
  return pluginDeepLinks().onOpen(handler);
}

/**
 * Synchronize a Level 0 plugin panel's internal route with HaloForge window
 * history. Plugins that keep their own tabs or pages should call `pushRoute`
 * for user-visible navigation and subscribe to `onRouteChange` to respond to
 * host Back/Forward.
 */
export function pluginNavigation(): PluginNavigationApi {
  const pluginId = requireCurrentPluginId("pluginNavigation");
  const navigation = requireNavigation();

  const toRequest = (route: string, options?: PluginNavigationOptions) => ({
    moduleId: options?.moduleId ?? null,
    route,
    params: options?.params ?? null,
  });

  return {
    getCurrent: (moduleId) => navigation.getCurrent(pluginId, moduleId),
    pushRoute: (route, options) => navigation.pushRoute(pluginId, toRequest(route, options)),
    replaceRoute: (route, options) => navigation.replaceRoute(pluginId, toRequest(route, options)),
    onRouteChange: (handler) => navigation.onRouteChange(pluginId, handler),
  };
}

/**
 * Ask HaloForge to open this plugin's route or resource using the host's
 * multi-window dispatcher. The host combines the request with the plugin
 * manifest's `window` policy and decides whether to focus, reuse, or create a
 * window.
 */
export function pluginWindows(): PluginWindowApi {
  const pluginId = requireCurrentPluginId("pluginWindows");
  const windows = requireWindows();

  const toRouteRequest = (route: string, options?: PluginWindowOpenOptions) => ({
    moduleId: options?.moduleId ?? null,
    route,
    params: options?.params ?? null,
    openMode: options?.openMode ?? null,
    reuseKey: options?.reuseKey ?? null,
    allowMultiple: options?.allowMultiple ?? null,
    resource: options?.resource ?? null,
  });

  const toResourceRequest = (
    resource: string,
    options?: Omit<PluginResourceOpenOptions, "resource"> & { route?: string | null },
  ) => ({
    moduleId: options?.moduleId ?? null,
    route: options?.route ?? null,
    params: options?.params ?? null,
    openMode: options?.openMode ?? null,
    reuseKey: options?.reuseKey ?? "resource",
    allowMultiple: options?.allowMultiple ?? null,
    resource,
  });

  return {
    openPluginRoute: (route, options) => windows.openPluginRoute(pluginId, toRouteRequest(route, options)),
    openResource: (resource, options) => windows.openResource(pluginId, toResourceRequest(resource, options)),
  };
}

/**
 * Update the native title of the current HaloForge window.
 *
 * The host only accepts title updates from the plugin that owns the currently
 * active plugin module/route, so hidden plugin panels cannot overwrite the
 * system taskbar preview title.
 */
export function pluginCurrentWindow(): PluginCurrentWindowApi {
  const pluginId = requireCurrentPluginId("pluginCurrentWindow");
  const currentWindow = requireCurrentWindow();

  return {
    setTitle: (title, options) => currentWindow.setTitle(pluginId, {
      moduleId: options?.moduleId ?? null,
      title,
      subtitle: options?.subtitle ?? null,
    }),
    resetTitle: (options) => currentWindow.resetTitle(pluginId, {
      moduleId: options?.moduleId ?? null,
    }),
  };
}

/**
 * Watch files through HaloForge's host-managed, cross-platform file service.
 * Requires the `file_watch` host capability and `host_file_watch` permission.
 */
export function pluginFiles(): HostFileWatchApi {
  const pluginId = requireCurrentPluginId("pluginFiles");
  const files = requireFiles();
  return {
    watch: (path, handler) => files.watch(pluginId, path, handler),
  };
}

export function watchHostFile(
  path: string,
  handler: (event: HostFileChangeEvent) => void,
): Promise<StopHostFileWatch> {
  return pluginFiles().watch(path, handler);
}

/**
 * Call the host-managed image gateway without exposing cloud tokens.
 *
 * The plugin manifest must request and be granted:
 *
 * ```json
 * { "type": "host_enterprise_gateway_access" }
 * ```
 */
export function enterpriseGateway(): EnterpriseGatewayApi {
  const pluginId = requireCurrentPluginId("enterpriseGateway");
  const gateway = requireEnterpriseGateway();
  return {
    generateImages: (request) => gateway.generateImages(pluginId, request),
    editImages: (request) => gateway.editImages(pluginId, request),
    listOutputs: (limit) => gateway.listOutputs(pluginId, limit),
  };
}
