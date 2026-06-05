import { readFile } from "node:fs/promises";

const versions = JSON.parse(await readFile(new URL("../versions.json", import.meta.url), "utf8"));
const pluginApiVersion = String(versions.pluginApiVersion ?? "").trim();
const rawTag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
const tag = rawTag.trim();
const expectedTag = `v${pluginApiVersion}`;

if (!pluginApiVersion) {
  throw new Error("versions.json pluginApiVersion is required.");
}

if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag || "<missing>"} must match ${expectedTag}.`);
}

console.log(`Release tag ${tag} matches HaloForge plugin API version ${pluginApiVersion}.`);
