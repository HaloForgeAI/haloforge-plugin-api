import { invoke } from "@tauri-apps/api/core";

// ─── Plugin-scoped IPC ────────────────────────────────────────────────────────

let _currentPluginId = "";

/** @internal Called once by the plugin runtime to set the current plugin context. */
export function _setPluginId(id: string): void {
  _currentPluginId = id;
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
