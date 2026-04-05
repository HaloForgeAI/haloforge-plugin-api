import type React from "react";
import type { PluginDefinition, FeaturePluginOptions, ModulePluginOptions, AssistantPluginOptions } from "./types";
import { _setPluginId } from "./ipc";

// ─── Global plugin component registry ────────────────────────────────────────
// The host app exposes window.__hf_plugin_registry.
// Plugin bundles call register() when they are dynamically imported.

declare global {
  interface Window {
    __hf_plugin_registry?: {
      register: (pluginId: string, def: PluginDefinition) => void;
      get: (pluginId: string) => PluginDefinition | undefined;
      getAll: () => Map<string, PluginDefinition>;
    };
  }
}

// ─── Entry-point helpers ──────────────────────────────────────────────────────

/**
 * Define a Level 1/2 plugin.
 * Call this as the default export of your plugin's frontend entry point.
 *
 * @example
 * ```tsx
 * export default definePlugin({
 *   slots: { "devkit.toolbar": MyToolbarButton },
 *   panel: MyPanel,
 * });
 * ```
 */
export function definePlugin(options: FeaturePluginOptions): PluginDefinition {
  return {
    _type: "feature",
    slots: options.slots,
    panel: options.panel,
    onMount: options.onMount,
    onUnmount: options.onUnmount,
  };
}

/**
 * Define a Level 0 (module-level) plugin.
 *
 * @example
 * ```tsx
 * export default defineModulePlugin({ component: MyModulePanel });
 * ```
 */
export function defineModulePlugin(options: ModulePluginOptions): PluginDefinition {
  return {
    _type: "module",
    panel: options.component,
    onMount: options.onMount,
    onUnmount: options.onUnmount,
  };
}

/**
 * Define a Level 3 (AI assistant) plugin.
 * The assistant metadata itself is declared in manifest.json.
 * This function is only needed if the plugin also provides UI.
 */
export function defineAssistantPlugin(options: AssistantPluginOptions): PluginDefinition {
  return {
    _type: "assistant",
    panel: options.component,
  };
}

/**
 * Register this plugin's definition with the host app.
 * Called automatically when the plugin bundle is imported.
 */
export function registerPlugin(pluginId: string, definition: PluginDefinition): void {
  _setPluginId(pluginId);
  if (typeof window !== "undefined" && window.__hf_plugin_registry) {
    window.__hf_plugin_registry.register(pluginId, definition);
  }
}
