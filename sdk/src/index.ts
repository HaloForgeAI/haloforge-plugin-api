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
export { enterpriseGateway, invokePlugin, invokeOtherPlugin, invokeHost, _setPluginId } from "./ipc";

// Components
export { AppSelect } from "./components/AppSelect";
export type { AppSelectProps, AppSelectChangeEvent } from "./components/AppSelect";
export { AppTooltip } from "./components/AppTooltip";
export type { AppTooltipPlacement, AppTooltipProps } from "./components/AppTooltip";

// Hooks
export {
  useSlotContext,
  usePluginInfo,
  usePluginSettings,
  useAppTheme,
  useHostTheme,
  useHostAppState,
  useHostNavigation,
  useHostFileIntent,
  useHostModels,
  useAvailableModels,
  useHostAI,
  pickHostFile,
  pickHostDirectory,
  saveHostFile,
  useHostData,
  usePluginStorage,
  useAppEvent,
  useHostEvent,
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
  HostNavigationApi,
  HostFileDialogOptions,
  HostFileIntent,
  UseHostFileIntentReturn,
  UseHostModelsReturn,
  HostAIRequest,
  UseHostAIReturn,
  EnterpriseGatewayApi,
  GatewayImageGenerationResult,
  GatewayOutputAsset,
  GatewayOutputAssetList,
  PluginGatewayImageEditFile,
  PluginGatewayImageEditRequest,
  PluginGatewayImageRequest,
  NotifyOptions,
  AppTheme,
} from "./types";
