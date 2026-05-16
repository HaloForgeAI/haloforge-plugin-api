import { invoke } from "@tauri-apps/api/core";
import type {
  EnterpriseGatewayApi,
  GatewayImageGenerationResult,
  GatewayOutputAssetList,
  PluginGatewayImageEditRequest,
  PluginGatewayImageRequest,
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
