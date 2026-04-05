/**
 * @haloforge/plugin-sdk
 *
 * The official SDK for building HaloForge plugins.
 *
 * ## Quick start
 *
 * ```tsx
 * // frontend/src/index.tsx
 * import { definePlugin } from "@haloforge/plugin-sdk";
 * import { MyPanel } from "./MyPanel";
 * import { MyToolbarButton } from "./MyToolbarButton";
 *
 * export default definePlugin({
 *   panel: MyPanel,
 *   slots: {
 *     "devkit.toolbar": MyToolbarButton,
 *   },
 * });
 * ```
 *
 * ## In your components
 *
 * ```tsx
 * import { invokePlugin, usePluginSettings, useSlotContext } from "@haloforge/plugin-sdk";
 *
 * export function MyPanel() {
 *   const { settings } = usePluginSettings<{ apiKey: string }>();
 *   // ...
 * }
 * ```
 */

// Entry-point helpers
export { definePlugin, defineModulePlugin, defineAssistantPlugin, registerPlugin } from "./registry";
export type { PluginDefinition, FeaturePluginOptions, ModulePluginOptions, AssistantPluginOptions } from "./types";

// IPC
export { invokePlugin, invokeOtherPlugin, invokeHost, _setPluginId } from "./ipc";

// Hooks
export {
  useSlotContext,
  usePluginInfo,
  usePluginSettings,
  useAppTheme,
  useHostData,
  usePluginStorage,
  useAppEvent,
  emitPluginEvent,
  notify,
  _setToastEmitter,
  PluginRuntimeContext,
} from "./hooks";

// Types
export type {
  UsePluginSettingsReturn,
  UseAppThemeReturn,
  UseHostDataReturn,
  HostDataResource,
  NotifyOptions,
  AppTheme,
} from "./types";
