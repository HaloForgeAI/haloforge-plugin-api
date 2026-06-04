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

test("hf-pack check accepts host_enterprise_gateway_access", async () => {
  await withPluginDir(
    {
      ...BASE_MANIFEST,
      host_capabilities: ["enterprise_gateway"],
      permissions: [{ type: "host_enterprise_gateway_access" }],
    },
    async (pluginDir) => {
      await assert.doesNotReject(() => checkPlugin(pluginDir));
    },
  );
});

test("hf-pack check accepts plugin deep link host capability and permission", async () => {
  await withPluginDir(
    {
      ...BASE_MANIFEST,
      host_capabilities: ["deep_links"],
      permissions: [{ type: "host_deep_links" }],
    },
    async (pluginDir) => {
      await assert.doesNotReject(() => checkPlugin(pluginDir));
    },
  );
});

test("hf-pack check accepts plugin window document handlers", async () => {
  await withPluginDir(
    {
      ...BASE_MANIFEST,
      host_capabilities: ["navigation", "file_intents"],
      window: {
        preferred_role: "document",
        default_open_mode: "reuse_or_new",
        reuse_key: "resource",
        allow_multiple: true,
        document_handlers: [
          {
            id: "markdown",
            label: "Markdown",
            extensions: [".md", ".markdown"],
            mime_types: ["text/markdown"],
            route: "/document",
            resource_param: "path",
          },
        ],
      },
    },
    async (pluginDir) => {
      await assert.doesNotReject(() => checkPlugin(pluginDir));
    },
  );
});

test("hf-pack check rejects incomplete plugin window document handlers", async () => {
  await withPluginDir(
    {
      ...BASE_MANIFEST,
      window: {
        document_handlers: [
          {
            route: "/document",
          },
        ],
      },
    },
    async (pluginDir) => {
      await assert.rejects(
        () => checkPlugin(pluginDir),
        /document_handlers\[0\].*extensions or mime_types/u,
      );
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
