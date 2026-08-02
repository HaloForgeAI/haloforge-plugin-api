import type React from "react";

// ─── Plugin definition ────────────────────────────────────────────────────────

export interface FeaturePluginOptions {
  /** Level 2 slot injections: slotId → React component */
  slots?: Record<string, React.ComponentType>;
  /** Level 0/1 full panel component */
  panel?: React.ComponentType;
  onMount?: () => void;
  onUnmount?: () => void;
}

export interface ModulePluginOptions {
  /** Level 0 full panel component */
  component: React.ComponentType;
  /** Optional sub-navigation for inside the module */
  subNav?: Array<{ id: string; label: string; icon: string }>;
  onMount?: () => void;
  onUnmount?: () => void;
}

export interface AssistantPluginOptions {
  /** Optional extra UI component (e.g. settings, context panel) */
  component?: React.ComponentType;
}

export interface PluginDefinition {
  _type: "feature" | "module" | "assistant";
  slots?: Record<string, React.ComponentType>;
  panel?: React.ComponentType;
  onMount?: () => void;
  onUnmount?: () => void;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface UsePluginSettingsReturn<T> {
  settings: T;
  updateSettings: (patch: Partial<T>) => Promise<void>;
}

// ─── Theme ───────────────────────────────────────────────────────────────────

export interface AppTheme {
  id: string;
  name: string;
  type: "dark" | "light";
  colors: Record<string, string>;
}

export interface UseAppThemeReturn {
  theme: AppTheme;
  cssVars: Record<string, string>;
}

export interface HostNavigationApi {
  activeModule: string;
  activeSettingsTab: string | null;
  navigateToModule: (moduleId: string) => void;
  openSettingsTab: (tabId: string) => void;
}

export interface PluginNavigationOptions {
  moduleId?: string | null;
  params?: Record<string, string> | null;
}

export type PluginWindowOpenMode =
  | "smart"
  | "current"
  | "new_window"
  | "reuse_existing"
  | "reuse_or_new";

export type PluginWindowReuseKey = "plugin" | "route" | "resource" | "none";

export interface PluginWindowOpenOptions extends PluginNavigationOptions {
  openMode?: PluginWindowOpenMode | null;
  reuseKey?: PluginWindowReuseKey | null;
  allowMultiple?: boolean | null;
  resource?: string | null;
}

export interface PluginResourceOpenOptions extends Omit<PluginWindowOpenOptions, "resource"> {
  resource: string;
}

export interface PluginWindowOpenResult {
  label: string;
  role: string;
  module: string;
}

export interface PluginRouteChange {
  moduleId: string;
  pluginId: string;
  route: string;
  params: Record<string, string>;
  changedAt: string;
}

export interface PluginNavigationApi {
  getCurrent: (moduleId?: string | null) => PluginRouteChange | null;
  pushRoute: (route: string, options?: PluginNavigationOptions) => PluginRouteChange;
  replaceRoute: (route: string, options?: PluginNavigationOptions) => PluginRouteChange;
  onRouteChange: (handler: (change: PluginRouteChange) => void) => () => void;
}

export interface UsePluginNavigationReturn extends PluginNavigationApi {
  current: PluginRouteChange | null;
}

export interface PluginWindowApi {
  openPluginRoute: (
    route: string,
    options?: PluginWindowOpenOptions,
  ) => Promise<PluginWindowOpenResult>;
  openResource: (
    resource: string,
    options?: Omit<PluginResourceOpenOptions, "resource"> & { route?: string | null },
  ) => Promise<PluginWindowOpenResult>;
}

export interface PluginWindowTitleOptions {
  moduleId?: string | null;
  subtitle?: string | null;
}

export interface PluginCurrentWindowApi {
  setTitle: (title: string, options?: PluginWindowTitleOptions) => Promise<void>;
  resetTitle: (options?: Pick<PluginWindowTitleOptions, "moduleId">) => Promise<void>;
}

export interface HostFileIntent {
  kind: string;
  path: string;
  source?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Deep links ──────────────────────────────────────────────────────────────

export interface PluginDeepLink {
  pluginId: string;
  route: string;
  url: string;
  params: Record<string, string>;
  receivedAt: string;
}

export interface PluginDeepLinkApi {
  getPending: () => PluginDeepLink | null;
  clearPending: () => void;
  onOpen: (handler: (link: PluginDeepLink) => void) => () => void;
}

export interface HostFileDialogOptions {
  title?: string;
  directory?: string;
  filters?: string[];
  defaultName?: string;
}

export type HostFileChangeKind = "create" | "modify" | "remove" | "other";

export interface HostFileChangeEvent {
  path: string;
  kind: HostFileChangeKind;
}

export type StopHostFileWatch = () => Promise<void>;

export interface HostFileWatchApi {
  watch: (
    path: string,
    handler: (event: HostFileChangeEvent) => void,
  ) => Promise<StopHostFileWatch>;
}

export interface UseHostFileWatchOptions {
  enabled?: boolean;
  onError?: (error: unknown) => void;
}

export interface UseHostFileIntentReturn {
  intent: HostFileIntent | null;
  setIntent: (intent: HostFileIntent | null) => void;
  consume: () => void;
}

export interface UseHostModelsReturn<TModel> {
  models: TModel[];
  selectedModelId: string | null;
  selectModel: (id: string | null) => void;
  refresh: () => Promise<void>;
}

export interface HostAIRequest {
  content: string;
  [key: string]: unknown;
}

export interface UseHostAIReturn<TModel, TResult> extends UseHostModelsReturn<TModel> {
  sendMessage: (request: string | HostAIRequest) => Promise<TResult>;
  stopGeneration: () => Promise<boolean>;
  createSession: <TSession = unknown>(session: TSession) => Promise<TSession>;
  getStreamState: <TStreamState = unknown>(sessionId: string) => Promise<TStreamState | null>;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface NotifyOptions {
  title: string;
  message: string;
  kind?: "info" | "success" | "warning" | "error";
  duration?: number;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

export type PluginLogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface PluginLogOptions {
  level?: PluginLogLevel;
  message: string;
  details?: unknown;
  scope?: string;
}

export interface PluginLogger {
  trace: (message: string, details?: unknown) => Promise<void>;
  debug: (message: string, details?: unknown) => Promise<void>;
  info: (message: string, details?: unknown) => Promise<void>;
  warn: (message: string, details?: unknown) => Promise<void>;
  error: (message: string, details?: unknown) => Promise<void>;
}

// ─── Managed image gateway ──────────────────────────────────────────────────

export interface GatewayOutputAsset {
  id: string;
  actor_user_id?: string | null;
  request_log_id?: number | null;
  upstream_channel_id?: string | null;
  endpoint: string;
  model?: string | null;
  object_ref: string;
  public_url: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string;
  source?: string | null;
  status?: string;
  scan_status?: string;
  share_scope?: string;
  retention_expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface GatewayImageGenerationResult {
  created?: number;
  hf_output_assets?: GatewayOutputAsset[];
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export interface GatewayOutputAssetList {
  outputs: GatewayOutputAsset[];
}

export interface PluginGatewayImageRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
  quality?: string;
  style?: string;
  output_format?: string;
  output_compression?: number;
  moderation?: string;
  response_format?: "url" | "b64_json";
  user?: string;
}

export interface PluginGatewayImageEditFile {
  field_name?: "image" | string;
  file_name: string;
  content_type?: string;
  b64_json: string;
}

export interface PluginGatewayImageEditRequest {
  model?: string;
  prompt: string;
  images: PluginGatewayImageEditFile[];
  mask?: PluginGatewayImageEditFile;
  size?: string;
  n?: number;
  quality?: string;
  output_format?: string;
  output_compression?: number;
  moderation?: string;
  response_format?: "url" | "b64_json";
  user?: string;
}

export interface EnterpriseGatewayApi {
  generateImages: (request: PluginGatewayImageRequest) => Promise<GatewayImageGenerationResult>;
  editImages: (request: PluginGatewayImageEditRequest) => Promise<GatewayImageGenerationResult>;
  listOutputs: (limit?: number) => Promise<GatewayOutputAssetList>;
}

// ─── Host data ────────────────────────────────────────────────────────────────

export type HostDataResource =
  | "devkit.profiles"
  | "devkit.workflows"
  | "devkit.snippets"
  | "devkit.directories"
  | "aichat.sessions"
  | "aichat.models";

export interface UseHostDataReturn<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
