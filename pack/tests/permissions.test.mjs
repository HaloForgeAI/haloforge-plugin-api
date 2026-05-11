import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkPlugin } from "../dist/core.js";

const BASE_MANIFEST = {
  $schema: "https://haloforge.dev/schemas/plugin/v1.json",
  id: "dev.haloforge.example",
  name: "Example Plugin",
  version: "0.1.0",
  description: "Example plugin",
  author: "HaloForge Team",
  compatibility: {
    min_app_version: "0.6.0",
    min_host_api_version: "0.1.0",
    platforms: ["windows", "macos", "linux"],
  },
  capability_levels: [0],
  integration: {},
  entry: {
    frontend: "frontend/index.js",
  },
};

async function withPluginDir(manifest, fn) {
  const pluginDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-pack-permissions-"));
  try {
    await fs.writeFile(
      path.join(pluginDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await fn(pluginDir);
  } finally {
    await fs.rm(pluginDir, { recursive: true, force: true });
  }
}

test("hf-pack check accepts host_aichat_access", async () => {
  await withPluginDir(
    {
      ...BASE_MANIFEST,
      permissions: [{ type: "host_aichat_access" }],
    },
    async (pluginDir) => {
      await assert.doesNotReject(() => checkPlugin(pluginDir));
    },
  );
});

test("hf-pack check rejects host_a_i_chat_access with a direct hint", async () => {
  await withPluginDir(
    {
      ...BASE_MANIFEST,
      permissions: [{ type: "host_a_i_chat_access" }],
    },
    async (pluginDir) => {
      await assert.rejects(
        () => checkPlugin(pluginDir),
        /host_a_i_chat_access'.*host_aichat_access/u,
      );
    },
  );
});
