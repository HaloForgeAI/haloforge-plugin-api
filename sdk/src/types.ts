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

export interface HostFileIntent {
  kind: string;
  path: string;
  source?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
}

export interface HostFileDialogOptions {
  title?: string;
  directory?: string;
  filters?: string[];
  defaultName?: string;
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
