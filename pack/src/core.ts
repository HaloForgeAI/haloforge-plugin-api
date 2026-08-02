import AdmZip from "adm-zip";
import chalk from "chalk";
import nacl from "tweetnacl";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type JsonObject = Record<string, unknown>;

export interface Manifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  license?: string;
  keywords?: string[];
  compatibility: {
    min_app_version: string;
    min_host_api_version?: string;
    max_app_version?: string;
    platforms?: string[];
  };
  capability_levels: number[];
  host_capabilities?: string[];
  window?: {
    default_open_mode?: string;
    reuse_key?: string;
    allow_multiple?: boolean;
    document_handlers?: Array<{
      id?: string;
      label?: string;
      extensions?: string[];
      mime_types?: string[];
      route: string;
      resource_param?: string;
      open_mode?: string;
      reuse_key?: string;
      allow_multiple?: boolean;
    }>;
  };
  entry?: {
    native?: Record<string, string>;
    frontend?: string;
    frontend_styles?: string;
  };
  [key: string]: unknown;
}

interface LoadedManifest {
  pluginDir: string;
  manifestPath: string;
  manifest: Manifest;
  raw: JsonObject;
}

interface CargoMetadata {
  packages: Array<{
    manifest_path: string;
    name: string;
    targets: Array<{
      name: string;
      kind: string[];
    }>;
  }>;
  target_directory: string;
}

interface CopyTarget {
  source: string;
  destination: string;
  directory: boolean;
}

interface ManifestPermission {
  type: string;
  value?: unknown;
}

interface PublicApiUsageWarning {
  code: string;
  message: string;
  files: string[];
}

export interface PackOptions {
  out?: string;
  release?: boolean;
  noBackend?: boolean;
  noFrontend?: boolean;
  target?: string;
}

export interface MetadataOptions {
  artifactUrl?: string;
  source?: string;
  slug?: string;
  homepageUrl?: string;
  repositoryUrl?: string;
  signingKeyId?: string;
  signingKeyBase64?: string;
  signingKeyEnv?: string;
  signature?: string;
  signatureAlgorithm?: string;
  output?: string;
  pretty?: boolean;
}

export interface SubmitOptions {
  apiBaseUrl?: string;
  token?: string;
  tokenEnv?: string;
}

export async function checkPlugin(pluginDirPath: string): Promise<void> {
  const { pluginDir, manifest } = await loadManifest(pluginDirPath);
  console.log(
    `${chalk.green("✓")} manifest is valid for ${chalk.bold(manifest.name)} v${chalk.yellow(manifest.version)}`,
  );
  await printPublicApiWarnings(pluginDir);
}

export async function infoTarget(targetPath: string): Promise<void> {
  const resolvedPath = await realpath(targetPath);

  if (path.extname(resolvedPath).toLowerCase() === ".hfpkg") {
    const archive = new AdmZip(resolvedPath);
    const entry = archive.getEntry("manifest.json");
    if (!entry) {
      throw new Error("manifest.json not found in archive");
    }

    const rawValue = JSON.parse(entry.getData().toString("utf8")) as unknown;
    const manifest = parseManifest(rawValue, "archive manifest.json");
    printManifestInfo(manifest, { archivePath: resolvedPath });
    const archiveStats = await stat(resolvedPath);
    console.log(`  archive size  ${chalk.cyan(formatSize(archiveStats.size))}`);
    return;
  }

  const { pluginDir, manifest } = await loadManifest(resolvedPath);
  printManifestInfo(manifest, { pluginDir });

  const hasBackend = Boolean(await findBackendManifestPath(pluginDir));
  const hasFrontend = Boolean(await findFrontendDir(pluginDir));
  console.log(`  backend       ${hasBackend ? chalk.green("yes") : chalk.dim("none")}`);
  console.log(`  frontend      ${hasFrontend ? chalk.green("yes") : chalk.dim("none")}`);
}

export async function packPlugin(pluginDirPath: string, options: PackOptions): Promise<void> {
  const loaded = await loadManifest(pluginDirPath);
  const { pluginDir, manifest, raw } = loaded;
  const stageDir = await mkdtemp(path.join(os.tmpdir(), "hf-pack-"));

  try {
    console.log(
      `${chalk.cyan.bold("Packing")} ${chalk.white.bold(manifest.name)} v${chalk.yellow(manifest.version)} ${chalk.dim(`(${manifest.id})`)}`,
    );
    await printPublicApiWarnings(pluginDir);

    await writeStageManifest(stageDir, raw);

    if (options.noBackend) {
      await copyPrebuiltNative(pluginDir, stageDir);
    } else {
      await stageBackend(pluginDir, stageDir, raw, options);
    }

    await stageFrontend(pluginDir, stageDir, manifest, options.noFrontend ?? false);
    await copyOptionalRootFiles(pluginDir, stageDir);
    await writeStageManifest(stageDir, raw);

    const outDir = resolveOutDir(pluginDir, options.out);
    await mkdir(outDir, { recursive: true });
    const packagePath = path.join(outDir, `${manifest.id}-${manifest.version}.hfpkg`);
    const fileCount = await createArchive(stageDir, packagePath);
    const packageStats = await stat(packagePath);
    const digest = await sha256File(packagePath);
    const shaPath = `${packagePath}.sha256`;
    await writeFile(shaPath, `${digest}  ${path.basename(packagePath)}\n`, "utf8");

    console.log(`\n${chalk.green.bold("Created")} ${packagePath}`);
    console.log(`  ${fileCount} files  ${chalk.cyan(formatSize(packageStats.size))}`);
    console.log(`  sha256        ${chalk.yellow(digest)}`);
    console.log(`  sha file      ${shaPath}`);
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

export async function metadataTarget(targetPath: string, options: MetadataOptions): Promise<void> {
  const resolvedPath = await realpath(targetPath);
  if (path.extname(resolvedPath).toLowerCase() !== ".hfpkg") {
    throw new Error("metadata expects a .hfpkg path");
  }

  const archive = new AdmZip(resolvedPath);
  const entry = archive.getEntry("manifest.json");
  if (!entry) {
    throw new Error("manifest.json not found in archive");
  }

  const rawValue = JSON.parse(entry.getData().toString("utf8")) as unknown;
  const manifest = parseManifest(rawValue, "archive manifest.json");
  const raw = rawValue as JsonObject;
  const stats = await stat(resolvedPath);
  const sha256 = await sha256File(resolvedPath);
  const signingKey = resolveSigningKey(options);

  if (signingKey && !options.signingKeyId) {
    throw new Error("signingKeyId is required when a signing key is provided");
  }

  const signature = options.signature?.trim() || (signingKey
    ? signPluginMetadata(
      manifest.id,
      manifest.version,
      manifest.compatibility.min_app_version,
      sha256,
      stats.size,
      signingKey,
    )
    : undefined);

  const payload = {
    schema_version: 1,
    kind: "plugin",
    item: {
      id: manifest.id,
      slug: options.slug?.trim() || slugify(manifest.id),
      kind: "plugin",
      name: manifest.name,
      summary: manifest.description,
      source: options.source ?? "official",
      homepage_url: options.homepageUrl ?? manifest.homepage ?? options.repositoryUrl,
      repository_url: options.repositoryUrl ?? manifest.homepage,
      author: normalizeAuthor(manifest.author),
      license: manifest.license,
      tags: normalizeTags(manifest),
    },
    version: {
      version: manifest.version,
      min_app_version: manifest.compatibility.min_app_version,
      max_app_version: manifest.compatibility.max_app_version,
      artifact_url: options.artifactUrl,
      artifact_size: stats.size,
      sha256,
      signature,
      signature_algorithm: options.signingKeyId ? (options.signatureAlgorithm ?? "ed25519") : undefined,
      signing_key_id: options.signingKeyId,
      manifest: raw,
    },
  };

  const json = options.pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  if (options.output) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await writeFile(options.output, `${json}\n`, "utf8");
    console.log(`${chalk.green.bold("Wrote")} ${options.output}`);
  } else {
    console.log(json);
  }
}

export async function submitDraft(draftPath: string, options: SubmitOptions): Promise<void> {
  const payloadText = await readFile(draftPath, "utf8");
  const bearer = resolveSubmitToken(options);
  if (!bearer) {
    throw new Error(
      `admin token missing; pass --token, set ${options.tokenEnv ?? "HF_ADMIN_TOKEN"}, or export HF_SESSION_TOKEN/HF_SESSION with your hfsess_... session token`,
    );
  }

  const apiBaseUrl = options.apiBaseUrl ?? "https://admin.haloforge.dev";
  const endpoint = `${apiBaseUrl.replace(/\/+$/, "")}/v1/admin/catalog/drafts`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: payloadText,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`admin API returned ${response.status}: ${body}`);
  }

  console.log(chalk.green.bold("Submitted catalog draft successfully."));
  console.log(`  endpoint      ${endpoint}`);
  console.log(`  response      ${body}`);
}

async function loadManifest(pluginDirPath: string): Promise<LoadedManifest> {
  const pluginDir = await realpath(pluginDirPath);
  const manifestPath = path.join(pluginDir, "manifest.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`manifest.json not found in ${pluginDir}`);
  }

  const rawText = await readFile(manifestPath, "utf8");
  const rawValue = JSON.parse(rawText) as unknown;
  const manifest = parseManifest(rawValue, manifestPath);

  return {
    pluginDir,
    manifestPath,
    manifest,
    raw: rawValue as JsonObject,
  };
}

function parseManifest(rawValue: unknown, source: string): Manifest {
  if (!isPlainObject(rawValue)) {
    throw new Error(`${source} must contain a JSON object`);
  }

  const manifest = rawValue as Manifest;
  validateManifest(manifest);
  return manifest;
}

function validateManifest(manifest: Manifest): void {
  requireString(manifest.id, "manifest.id");
  requireString(manifest.name, "manifest.name");
  requireString(manifest.version, "manifest.version");
  requireString(manifest.description, "manifest.description");
  requireString(manifest.author, "manifest.author");

  if (!SEMVER_RE.test(manifest.version)) {
    throw new Error("manifest.version must be a semantic version like 0.1.0");
  }

  if (!isPlainObject(manifest.compatibility)) {
    throw new Error("manifest.compatibility is required");
  }
  requireString(manifest.compatibility.min_app_version, "manifest.compatibility.min_app_version");
  if (manifest.compatibility.min_host_api_version !== undefined) {
    requireString(
      manifest.compatibility.min_host_api_version,
      "manifest.compatibility.min_host_api_version",
    );
    if (!SEMVER_RE.test(manifest.compatibility.min_host_api_version)) {
      throw new Error("manifest.compatibility.min_host_api_version must be a semantic version like 0.1.0");
    }
  }

  if (!Array.isArray(manifest.capability_levels) || manifest.capability_levels.length === 0) {
    throw new Error("manifest.capability_levels must contain at least one capability level");
  }
  for (const level of manifest.capability_levels) {
    if (!Number.isInteger(level) || level < 0 || level > 4) {
      throw new Error(`invalid capability level: ${String(level)}`);
    }
  }

  if (manifest.host_capabilities !== undefined) {
    if (!Array.isArray(manifest.host_capabilities)) {
      throw new Error("manifest.host_capabilities must be an array when provided");
    }
    for (const capability of manifest.host_capabilities) {
      requireString(capability, "manifest.host_capabilities[]");
      if (!HOST_CAPABILITIES.has(capability)) {
        throw new Error(`invalid host capability: ${capability}`);
      }
    }
  }

  validateManifestPermissions(manifest.permissions);
  validateManifestWindowPolicy(manifest.window);

  const frontendPath = manifest.entry?.frontend;
  const stylesPath = manifest.entry?.frontend_styles;

  if (frontendPath !== undefined) {
    requireRelativePath(frontendPath, "manifest.entry.frontend");
  }
  if (stylesPath !== undefined) {
    requireRelativePath(stylesPath, "manifest.entry.frontend_styles");
  }

  if (manifest.entry?.native) {
    for (const [field, value] of Object.entries(manifest.entry.native)) {
      requireRelativePath(value, `manifest.entry.native.${field}`);
    }
  }
}

function validateManifestWindowPolicy(rawWindow: unknown): void {
  if (rawWindow === undefined) {
    return;
  }
  if (!isPlainObject(rawWindow)) {
    throw new Error("manifest.window must be an object when provided");
  }

  const windowPolicy = rawWindow as JsonObject;
  validateOptionalWindowOpenMode(windowPolicy.default_open_mode, "manifest.window.default_open_mode");
  validateOptionalWindowReuseKey(windowPolicy.reuse_key, "manifest.window.reuse_key");
  validateOptionalBoolean(windowPolicy.allow_multiple, "manifest.window.allow_multiple");

  if (windowPolicy.document_handlers === undefined) {
    return;
  }
  if (!Array.isArray(windowPolicy.document_handlers)) {
    throw new Error("manifest.window.document_handlers must be an array when provided");
  }

  for (const [index, rawHandler] of windowPolicy.document_handlers.entries()) {
    validateManifestDocumentHandler(rawHandler, index);
  }
}

function validateManifestDocumentHandler(rawHandler: unknown, index: number): void {
  const base = `manifest.window.document_handlers[${index}]`;
  if (!isPlainObject(rawHandler)) {
    throw new Error(`${base} must be an object`);
  }

  const handler = rawHandler as JsonObject;
  validateOptionalString(handler.id, `${base}.id`);
  validateOptionalString(handler.label, `${base}.label`);
  requireString(handler.route, `${base}.route`);
  validateOptionalString(handler.resource_param, `${base}.resource_param`);
  validateOptionalWindowOpenMode(handler.open_mode, `${base}.open_mode`);
  validateOptionalWindowReuseKey(handler.reuse_key, `${base}.reuse_key`);
  validateOptionalBoolean(handler.allow_multiple, `${base}.allow_multiple`);

  const extensions = validateOptionalStringArray(handler.extensions, `${base}.extensions`);
  const mimeTypes = validateOptionalStringArray(handler.mime_types, `${base}.mime_types`);
  if (extensions.length === 0 && mimeTypes.length === 0) {
    throw new Error(`${base} must declare extensions or mime_types`);
  }
}

function validateOptionalString(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  requireString(value, fieldName);
}

function validateOptionalBoolean(value: unknown, fieldName: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
}

function validateOptionalStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
  for (const [index, item] of value.entries()) {
    requireString(item, `${fieldName}[${index}]`);
  }
  return value;
}

function validateOptionalWindowOpenMode(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  requireString(value, fieldName);
  if (!WINDOW_OPEN_MODES.has(value)) {
    throw new Error(`${fieldName} has unsupported open mode '${value}'`);
  }
}

function validateOptionalWindowReuseKey(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  requireString(value, fieldName);
  if (!WINDOW_REUSE_KEYS.has(value)) {
    throw new Error(`${fieldName} has unsupported reuse key '${value}'`);
  }
}

const HOST_AICHAT_ACCESS_PERMISSION = "host_aichat_access";
const INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION = "host_a_i_chat_access";

const PERMISSION_SCHEMAS = new Map<string, { value: "none" | "string" | "string-array" }>([
  ["database_read_all", { value: "none" }],
  ["database_read", { value: "string" }],
  ["database_write", { value: "string" }],
  ["database_create_tables", { value: "none" }],
  ["filesystem_read", { value: "none" }],
  ["filesystem_read_app_data", { value: "none" }],
  ["filesystem_write", { value: "none" }],
  ["filesystem_write_app_data", { value: "none" }],
  ["network_http", { value: "none" }],
  ["network_http_domain", { value: "string" }],
  ["ipc_register", { value: "none" }],
  ["events_emit", { value: "none" }],
  ["events_listen", { value: "none" }],
  ["ui_inject", { value: "none" }],
  ["process_spawn", { value: "none" }],
  ["process_spawn_whitelist", { value: "string-array" }],
  ["notifications", { value: "none" }],
  ["clipboard_read", { value: "none" }],
  ["clipboard_write", { value: "none" }],
  ["host_navigation", { value: "none" }],
  ["host_app_state_read", { value: "none" }],
  ["host_file_intents", { value: "none" }],
  ["host_file_dialogs", { value: "none" }],
  ["host_file_watch", { value: "none" }],
  [HOST_AICHAT_ACCESS_PERMISSION, { value: "none" }],
  ["host_enterprise_gateway_access", { value: "none" }],
  ["host_deep_links", { value: "none" }],
  ["host_theme_read", { value: "none" }],
  ["host_event_subscribe", { value: "none" }],
  ["app_config_read", { value: "none" }],
]);

function validateManifestPermissions(rawPermissions: unknown): void {
  if (rawPermissions === undefined) {
    return;
  }
  if (!Array.isArray(rawPermissions)) {
    throw new Error("manifest.permissions must be an array when provided");
  }
  for (const [index, rawPermission] of rawPermissions.entries()) {
    validateManifestPermission(rawPermission, index);
  }
}

function validateManifestPermission(rawPermission: unknown, index: number): void {
  if (!isPlainObject(rawPermission)) {
    throw new Error(`manifest.permissions[${index}] must be a JSON object`);
  }

  const permission = rawPermission as unknown as ManifestPermission;
  requireString(permission.type, `manifest.permissions[${index}].type`);

  if (permission.type === INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION) {
    throw new Error(
      `manifest.permissions[${index}] uses invalid permission '${INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION}'. Use '${HOST_AICHAT_ACCESS_PERMISSION}'.`,
    );
  }

  const schema = PERMISSION_SCHEMAS.get(permission.type);
  if (!schema) {
    throw new Error(`manifest.permissions[${index}] uses unknown permission '${permission.type}'.`);
  }

  if (schema.value === "string") {
    requireString(permission.value, `manifest.permissions[${index}].value`);
    return;
  }

  if (schema.value === "string-array") {
    if (!Array.isArray(permission.value)) {
      throw new Error(`manifest.permissions[${index}].value must be an array of strings`);
    }
    for (const [valueIndex, item] of permission.value.entries()) {
      requireString(item, `manifest.permissions[${index}].value[${valueIndex}]`);
    }
  }
}

async function stageBackend(
  pluginDir: string,
  stageDir: string,
  rawManifest: JsonObject,
  options: PackOptions,
): Promise<void> {
  const backendManifestPath = await findBackendManifestPath(pluginDir);
  if (!backendManifestPath) {
    await copyPrebuiltNative(pluginDir, stageDir);
    if (!(await pathExists(path.join(pluginDir, "native")))) {
      console.log(`  ${chalk.dim("skip native build")} no Cargo.toml found`);
    }
    return;
  }

  const profile = options.release ? "release" : "debug";
  const targetTriple = options.target ?? currentTriple();
  console.log(`  ${chalk.cyan("building")} Rust backend (${profile}${options.target ? ` -> ${options.target}` : ""})`);

  const buildArgs = ["build", "--manifest-path", backendManifestPath];
  if (options.release) {
    buildArgs.push("--release");
  }
  if (options.target) {
    buildArgs.push("--target", options.target);
  }

  await runCommand("cargo", buildArgs, path.dirname(backendManifestPath));

  const metadataResult = await runCommand(
    "cargo",
    ["metadata", "--format-version", "1", "--no-deps", "--manifest-path", backendManifestPath],
    path.dirname(backendManifestPath),
    { capture: true },
  );

  const metadata = JSON.parse(metadataResult.stdout) as CargoMetadata;
  const packageMeta =
    metadata.packages.find((pkg) => normalizeFilePath(pkg.manifest_path) === normalizeFilePath(backendManifestPath)) ??
    metadata.packages[0];

  if (!packageMeta) {
    throw new Error("cargo metadata did not return a package entry for the backend");
  }

  const libraryTarget =
    packageMeta.targets.find((target) => target.kind.includes("cdylib")) ??
    packageMeta.targets.find((target) => target.kind.includes("lib")) ??
    packageMeta.targets[0];

  if (!libraryTarget) {
    throw new Error("could not determine the Rust library target from cargo metadata");
  }

  const libraryName = libraryTarget.name.replace(/-/g, "_");
  const extension = tripleToLibraryExtension(targetTriple);
  const prefix = extension === "dll" ? "" : "lib";
  const expectedName = `${prefix}${libraryName}.${extension}`;
  const outputDir = options.target
    ? path.join(metadata.target_directory, options.target, profile)
    : path.join(metadata.target_directory, profile);
  const artifactPath = await findFileRecursive(outputDir, expectedName);

  if (!artifactPath) {
    throw new Error(`compiled backend artifact not found: ${expectedName}`);
  }

  const stagedRelativePath = toPosix(path.join("native", `${targetTriple}.${extension}`));
  const stagedAbsolutePath = path.join(stageDir, ...splitManifestPath(stagedRelativePath));
  await mkdir(path.dirname(stagedAbsolutePath), { recursive: true });
  await copyFile(artifactPath, stagedAbsolutePath);
  patchManifestNative(rawManifest, targetTriple, stagedRelativePath);
  console.log(`    ${chalk.green("copied")} ${artifactPath} -> ${stagedRelativePath}`);
}

async function copyPrebuiltNative(pluginDir: string, stageDir: string): Promise<void> {
  const nativeDir = path.join(pluginDir, "native");
  if (!(await pathExists(nativeDir))) {
    return;
  }

  const destination = path.join(stageDir, "native");
  await copyPath(nativeDir, destination);
  console.log(`  ${chalk.green("copied")} prebuilt native files`);
}

async function stageFrontend(
  pluginDir: string,
  stageDir: string,
  manifest: Manifest,
  noFrontend: boolean,
): Promise<void> {
  const outputPaths = [manifest.entry?.frontend, manifest.entry?.frontend_styles].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const frontendDir = await findFrontendDir(pluginDir);

  if (outputPaths.length === 0) {
    if (frontendDir && !noFrontend) {
      throw new Error("manifest.entry.frontend is required when packaging a frontend bundle");
    }
    return;
  }

  if (!noFrontend && frontendDir) {
    const packageManager = detectPackageManager(frontendDir);
    console.log(`  ${chalk.cyan("building")} frontend (${packageManager.name})`);
    await runCommand(packageManager.command, packageManager.installArgs, frontendDir);
    await runCommand(packageManager.command, packageManager.buildArgs, frontendDir);
    const distDir = path.join(frontendDir, "dist");
    if (await pathExists(distDir)) {
      const frontendRoot = outputPaths[0] ? splitManifestPath(outputPaths[0])[0] : "frontend";
      await copyPath(distDir, path.join(stageDir, frontendRoot));
      console.log(`    ${chalk.green("copied")} frontend dist`);
      return;
    }
  } else if (!frontendDir) {
    console.log(`  ${chalk.dim("skip frontend build")} no package.json found`);
  } else {
    console.log(`  ${chalk.dim("skip frontend build")} using prebuilt frontend assets`);
    const distDir = path.join(frontendDir, "dist");
    if (await pathExists(distDir)) {
      const frontendRoot = outputPaths[0] ? splitManifestPath(outputPaths[0])[0] : "frontend";
      await copyPath(distDir, path.join(stageDir, frontendRoot));
      console.log(`    ${chalk.green("copied")} prebuilt frontend dist`);
      return;
    }
  }

  const copyTargets = await deriveCopyTargets(pluginDir, stageDir, frontendDir, outputPaths);
  for (const copyTarget of copyTargets) {
    await copyPath(copyTarget.source, copyTarget.destination);
  }

  if (copyTargets.length > 0) {
    console.log(`    ${chalk.green("copied")} frontend outputs`);
  }
}

async function deriveCopyTargets(
  pluginDir: string,
  stageDir: string,
  frontendDir: string | null,
  outputPaths: string[],
): Promise<CopyTarget[]> {
  const targets = new Map<string, CopyTarget>();

  for (const relativeOutputPath of outputPaths) {
    const resolvedOutput = await resolveFrontendOutput(pluginDir, stageDir, frontendDir, relativeOutputPath);
    const key = `${resolvedOutput.sourceRoot}->${resolvedOutput.destinationRoot}`;
    if (targets.has(key)) {
      continue;
    }

    targets.set(key, {
      source: resolvedOutput.sourceRoot,
      destination: resolvedOutput.destinationRoot,
      directory: true,
    });
  }

  return [...targets.values()];
}

async function resolveFrontendOutput(
  pluginDir: string,
  stageDir: string,
  frontendDir: string | null,
  relativeOutputPath: string,
): Promise<{ sourceRoot: string; destinationRoot: string }> {
  const outputParts = splitManifestPath(relativeOutputPath);
  const manifestOutputPath = toPosix(relativeOutputPath);
  const frontendDirName = frontendDir ? path.basename(frontendDir) : null;
  const trimmedParts = frontendDirName && outputParts[0] === frontendDirName ? outputParts.slice(1) : outputParts;
  const trimmedPath = trimmedParts.join("/");

  const directSource = resolvePluginPath(pluginDir, manifestOutputPath);
  if (await pathExists(directSource)) {
    const sourceStats = await stat(directSource);
    if (sourceStats.isDirectory()) {
      return {
        sourceRoot: directSource,
        destinationRoot: path.join(stageDir, ...splitManifestPath(manifestOutputPath)),
      };
    }

    return {
      sourceRoot: directSource,
      destinationRoot: path.join(stageDir, ...splitManifestPath(manifestOutputPath)),
    };
  }

  if (frontendDir) {
    const buildCandidates = [
      path.join(frontendDir, "dist"),
      path.join(frontendDir, "build"),
      path.join(frontendDir, ".output"),
      frontendDir,
    ];

    for (const buildRoot of buildCandidates) {
      if (!(await pathExists(buildRoot))) {
        continue;
      }

      const relativeInsideBuild = trimmedPath || path.basename(manifestOutputPath);
      const candidateSource = path.join(buildRoot, ...splitManifestPath(relativeInsideBuild));
      if (await pathExists(candidateSource)) {
        const candidateStats = await stat(candidateSource);
        if (candidateStats.isDirectory()) {
          return {
            sourceRoot: candidateSource,
            destinationRoot: path.join(stageDir, ...splitManifestPath(manifestOutputPath)),
          };
        }

        const buildRootName = path.basename(buildRoot);
        if (["dist", "build", ".output"].includes(buildRootName)) {
          const relativeWithinBuild = toPosix(path.relative(buildRoot, candidateSource));
          const destinationRootRelative = stripSuffixPath(manifestOutputPath, relativeWithinBuild);
          return {
            sourceRoot: buildRoot,
            destinationRoot: path.join(stageDir, ...splitManifestPath(destinationRootRelative)),
          };
        }

        return {
          sourceRoot: candidateSource,
          destinationRoot: path.join(stageDir, ...splitManifestPath(manifestOutputPath)),
        };
      }
    }
  }

  throw new Error(`declared frontend output not found: ${relativeOutputPath}`);
}

async function copyOptionalRootFiles(pluginDir: string, stageDir: string): Promise<void> {
  for (const name of ["assets", "LICENSE"]) {
    const source = path.join(pluginDir, name);
    if (!(await pathExists(source))) {
      continue;
    }

    await copyPath(source, path.join(stageDir, name));
  }
}

async function writeStageManifest(stageDir: string, rawManifest: JsonObject): Promise<void> {
  const destination = path.join(stageDir, "manifest.json");
  await writeFile(destination, `${JSON.stringify(rawManifest, null, 2)}\n`, "utf8");
}

async function createArchive(stageDir: string, outputPath: string): Promise<number> {
  const zip = new AdmZip();
  const files = await collectFiles(stageDir);

  for (const filePath of files) {
    const relativePath = toPosix(path.relative(stageDir, filePath));
    const data = await readFile(filePath);
    zip.addFile(relativePath, data);
  }

  zip.writeZip(outputPath);
  return files.length;
}

async function sha256File(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function collectFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function copyPath(source: string, destination: string): Promise<void> {
  const sourceStats = await stat(source);
  if (sourceStats.isDirectory()) {
    await cp(source, destination, { recursive: true });
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function findBackendManifestPath(pluginDir: string): Promise<string | null> {
  for (const candidate of [
    path.join(pluginDir, "backend", "Cargo.toml"),
    path.join(pluginDir, "native", "Cargo.toml"),
    path.join(pluginDir, "rust", "Cargo.toml"),
    path.join(pluginDir, "Cargo.toml"),
  ]) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function findFrontendDir(pluginDir: string): Promise<string | null> {
  for (const candidate of [
    path.join(pluginDir, "frontend"),
    path.join(pluginDir, "ui"),
    path.join(pluginDir, "web"),
    path.join(pluginDir, "app"),
    pluginDir,
  ]) {
    if (await pathExists(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return null;
}

async function printPublicApiWarnings(pluginDir: string): Promise<void> {
  const warnings = await inspectPublicApiUsage(pluginDir);
  for (const warning of warnings) {
    console.warn(`${chalk.yellow.bold("warning:")} ${warning.message}`);
    for (const file of warning.files) {
      console.warn(`  ${chalk.dim(warning.code)} ${file}`);
    }
  }
}

async function inspectPublicApiUsage(pluginDir: string): Promise<PublicApiUsageWarning[]> {
  const sourceFiles = await collectPluginSourceFiles(pluginDir);
  const findings = new Map<string, PublicApiUsageWarning>();

  for (const filePath of sourceFiles) {
    const content = await readFile(filePath, "utf8");

    if (content.includes("__HF_HOST")) {
      appendWarning(
        findings,
        "private-host-bridge",
        "Found direct `__HF_HOST` usage. Prefer `@haloforge/plugin-sdk` host hooks so the plugin stays compatible with a black-box HaloForge host.",
        filePath,
      );
    }

    for (const command of DIRECT_HOST_IPC_COMMANDS) {
      if (content.includes(command)) {
        const message = command === "plugin_invoke"
          ? "Found direct plugin IPC usage. Prefer `invokePlugin()` or `invokeOtherPlugin()` from `@haloforge/plugin-sdk` instead of manually constructing `plugin_invoke` wire names."
          : "Found direct host IPC usage. Prefer `@haloforge/plugin-sdk` host APIs instead of hard-coding HaloForge internal commands.";
        appendWarning(
          findings,
          command === "plugin_invoke" ? "direct-plugin-ipc" : "direct-host-ipc",
          message,
          filePath,
        );
        break;
      }
    }
  }

  return [...findings.values()];
}

function appendWarning(
  findings: Map<string, PublicApiUsageWarning>,
  code: string,
  message: string,
  filePath: string,
) {
  const entry = findings.get(code);
  const normalizedPath = toPosix(filePath);
  if (entry) {
    if (!entry.files.includes(normalizedPath)) {
      entry.files.push(normalizedPath);
    }
    return;
  }

  findings.set(code, {
    code,
    message,
    files: [normalizedPath],
  });
}

async function collectPluginSourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_PLUGIN_SOURCE_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPluginSourceFiles(fullPath)));
      continue;
    }

    if (SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function detectPackageManager(frontendDir: string): {
  name: string;
  command: string;
  installArgs: string[];
  buildArgs: string[];
} {
  const packageJsonPath = path.join(frontendDir, "package.json");
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { packageManager?: string };
    const declaredPackageManager = packageJson.packageManager?.split("@")[0];
    if (declaredPackageManager === "pnpm") {
      return {
        name: "pnpm",
        command: platformCommand("pnpm"),
        installArgs: ["install"],
        buildArgs: ["run", "build"],
      };
    }
    if (declaredPackageManager === "yarn") {
      return {
        name: "yarn",
        command: platformCommand("yarn"),
        installArgs: ["install"],
        buildArgs: ["run", "build"],
      };
    }
    if (declaredPackageManager === "bun") {
      return {
        name: "bun",
        command: platformCommand("bun"),
        installArgs: ["install"],
        buildArgs: ["run", "build"],
      };
    }
    if (declaredPackageManager === "npm") {
      return {
        name: "npm",
        command: platformCommand("npm"),
        installArgs: ["install", "--silent"],
        buildArgs: ["run", "build"],
      };
    }
  }

  const definitions = [
    {
      lockfile: "pnpm-lock.yaml",
      name: "pnpm",
      command: platformCommand("pnpm"),
      installArgs: ["install"],
      buildArgs: ["run", "build"],
    },
    {
      lockfile: "yarn.lock",
      name: "yarn",
      command: platformCommand("yarn"),
      installArgs: ["install"],
      buildArgs: ["run", "build"],
    },
    {
      lockfile: "bun.lockb",
      name: "bun",
      command: platformCommand("bun"),
      installArgs: ["install"],
      buildArgs: ["run", "build"],
    },
    {
      lockfile: "bun.lock",
      name: "bun",
      command: platformCommand("bun"),
      installArgs: ["install"],
      buildArgs: ["run", "build"],
    },
  ];

  for (const definition of definitions) {
    if (existsSync(path.join(frontendDir, definition.lockfile))) {
      return definition;
    }
  }

  return {
    name: "npm",
    command: platformCommand("npm"),
    installArgs: ["install", "--silent"],
    buildArgs: ["run", "build"],
  };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: { capture?: boolean } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    const child = spawn(command, args, {
      cwd,
      shell: useShell,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";

    if (options.capture) {
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", (error) => {
      reject(new Error(`failed to start ${command}: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${String(code)}`));
    });
  });
}

async function findFileRecursive(rootDir: string, targetName: string): Promise<string | null> {
  if (!(await pathExists(rootDir))) {
    return null;
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name === targetName) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const match = await findFileRecursive(fullPath, targetName);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function patchManifestNative(rawManifest: JsonObject, triple: string, relativePath: string): void {
  const field = tripleToNativeField(triple);
  if (!field) {
    return;
  }

  const entry = ensureObject(rawManifest, "entry");
  const native = ensureObject(entry, "native");
  for (const key of Object.keys(native)) {
    delete native[key];
  }
  native[field] = relativePath;

  const compatibility = ensureObject(rawManifest, "compatibility");
  compatibility.platforms = [tripleToPlatformFamily(triple)];
}

function ensureObject(container: JsonObject, key: string): JsonObject {
  const existing = container[key];
  if (isPlainObject(existing)) {
    return existing;
  }

  const replacement: JsonObject = {};
  container[key] = replacement;
  return replacement;
}

function printManifestInfo(
  manifest: Manifest,
  options: { archivePath?: string; pluginDir?: string },
): void {
  console.log(`\n${chalk.dim("─── Plugin Info ─────────────────────────────")}`);
  if (options.archivePath) {
    console.log(`  file          ${chalk.white(options.archivePath)}`);
  }
  if (options.pluginDir) {
    console.log(`  plugin dir    ${chalk.white(options.pluginDir)}`);
  }
  console.log(`  id            ${chalk.white.bold(manifest.id)}`);
  console.log(`  name          ${chalk.white(manifest.name)}`);
  console.log(`  version       ${chalk.yellow(manifest.version)}`);
  console.log(`  description   ${manifest.description}`);
  console.log(`  author        ${manifest.author}`);
  console.log(`  capabilities  ${manifest.capability_levels.join(", ")}`);

  const platforms = Object.entries(manifest.entry?.native ?? {})
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key]) => PLATFORM_LABELS[key] ?? key);
  if (platforms.length > 0) {
    console.log(`  platforms     ${platforms.join(", ")}`);
  }
  console.log(`${chalk.dim("─────────────────────────────────────────────")}`);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveOutDir(pluginDir: string, outDir?: string): string {
  if (!outDir) {
    return path.join(pluginDir, "dist");
  }
  return path.isAbsolute(outDir) ? outDir : path.resolve(pluginDir, outDir);
}

function inferCopyRoot(relativePath: string): string | null {
  const parts = splitManifestPath(relativePath);
  const distIndex = parts.lastIndexOf("dist");
  if (distIndex >= 0) {
    return parts.slice(0, distIndex + 1).join("/");
  }

  const lastPart = parts.at(-1);
  if (!lastPart) {
    return null;
  }

  if (/\.[A-Za-z0-9]+$/.test(lastPart)) {
    return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
  }

  return parts.join("/");
}

function stripSuffixPath(fullPath: string, suffixPath: string): string {
  const fullParts = splitManifestPath(fullPath);
  const suffixParts = splitManifestPath(suffixPath);

  if (suffixParts.length === 0 || suffixParts.length > fullParts.length) {
    return fullPath;
  }

  const tail = fullParts.slice(fullParts.length - suffixParts.length);
  if (tail.join("/") !== suffixParts.join("/")) {
    return fullPath;
  }

  const prefix = fullParts.slice(0, fullParts.length - suffixParts.length).join("/");
  return prefix || ".";
}

function resolveSigningKey(options: MetadataOptions): string | undefined {
  const direct = options.signingKeyBase64?.trim();
  if (direct) {
    return direct;
  }
  const envName = options.signingKeyEnv ?? "HF_PLUGIN_SIGNING_PRIVATE_KEY";
  return process.env[envName]?.trim() || undefined;
}

function resolveSubmitToken(options: SubmitOptions): string | undefined {
  const direct = options.token?.trim();
  if (direct) {
    return direct;
  }

  const primaryEnv = options.tokenEnv ?? "HF_ADMIN_TOKEN";
  const envCandidates = [primaryEnv];
  if (primaryEnv !== "HF_ADMIN_TOKEN") {
    envCandidates.push("HF_ADMIN_TOKEN");
  }
  envCandidates.push("HF_SESSION_TOKEN", "HF_SESSION");

  for (const envName of envCandidates) {
    const value = process.env[envName]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function signPluginMetadata(
  catalogId: string,
  version: string,
  minAppVersion: string,
  sha256: string,
  artifactSize: number,
  signingKeyBase64: string,
): string {
  const payload = canonicalSignaturePayload(catalogId, version, minAppVersion, sha256, artifactSize);
  const signingKey = decodeSigningKey(signingKeyBase64);
  const signature = nacl.sign.detached(payload, signingKey);
  return Buffer.from(signature).toString("base64");
}

function canonicalSignaturePayload(
  catalogId: string,
  version: string,
  minAppVersion: string,
  sha256: string,
  artifactSize: number,
): Uint8Array {
  return Buffer.from(JSON.stringify({
    kind: "plugin",
    id: catalogId,
    version,
    sha256,
    artifact_size: artifactSize,
    min_app_version: minAppVersion,
  }), "utf8");
}

function decodeSigningKey(signingKeyBase64: string): Uint8Array {
  const keyBytes = Buffer.from(signingKeyBase64.trim(), "base64");

  if (keyBytes.length === 32) {
    return nacl.sign.keyPair.fromSeed(new Uint8Array(keyBytes)).secretKey;
  }

  if (keyBytes.length === 64) {
    return new Uint8Array(keyBytes);
  }

  throw new Error("signing key must decode to 32-byte seed or 64-byte keypair");
}

function normalizeAuthor(author: string): JsonObject {
  return { name: author };
}

function normalizeTags(manifest: Manifest): string[] {
  const tags = new Set<string>();
  for (const keyword of manifest.keywords ?? []) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized) tags.add(normalized);
  }
  for (const level of manifest.capability_levels) {
    tags.add(`level-${String(level)}`);
  }
  for (const capability of manifest.host_capabilities ?? []) {
    tags.add(`host-${capability}`);
  }
  return [...tags].sort();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^dev\.haloforge\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "plugin";
}

function requireString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
}

function requireRelativePath(value: unknown, fieldName: string): asserts value is string {
  requireString(value, fieldName);
  if (path.isAbsolute(value)) {
    throw new Error(`${fieldName} must be a relative path`);
  }

  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${fieldName} must stay within the plugin directory`);
  }
}

function resolvePluginPath(pluginDir: string, relativePath: string): string {
  return path.join(pluginDir, ...splitManifestPath(relativePath));
}

function splitManifestPath(relativePath: string): string[] {
  return relativePath.split(/[\\/]+/).filter((segment) => Boolean(segment) && segment !== ".");
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFilePath(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

function platformCommand(command: string): string {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function tripleToLibraryExtension(triple: string): string {
  if (triple.includes("windows")) {
    return "dll";
  }
  if (triple.includes("apple")) {
    return "dylib";
  }
  return "so";
}

function tripleToNativeField(triple: string): string | null {
  if (triple.includes("aarch64") && triple.includes("apple")) return "macos_arm64";
  if (triple.includes("x86_64") && triple.includes("apple")) return "macos_x64";
  if (triple.includes("x86_64") && triple.includes("windows")) return "windows_x64";
  if (triple.includes("aarch64") && triple.includes("windows")) return "windows_arm64";
  if (triple.includes("x86_64") && triple.includes("linux")) return "linux_x64";
  if (triple.includes("aarch64") && triple.includes("linux")) return "linux_arm64";
  return null;
}

function tripleToPlatformFamily(triple: string): string {
  if (triple.includes("apple")) return "macos";
  if (triple.includes("windows")) return "windows";
  if (triple.includes("linux")) return "linux";
  return "unknown";
}

function currentTriple(): string {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin";
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin";
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc";
  if (process.platform === "win32" && process.arch === "arm64") return "aarch64-pc-windows-msvc";
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu";
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu";
  return "unknown";
}

function formatSize(bytes: number): string {
  const kib = 1024;
  const mib = kib * 1024;
  if (bytes >= mib) {
    return `${(bytes / mib).toFixed(1)} MB`;
  }
  if (bytes >= kib) {
    return `${(bytes / kib).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const HOST_CAPABILITIES = new Set([
  "navigation",
  "app_state",
  "file_intents",
  "file_dialogs",
  "file_watch",
  "aichat",
  "enterprise_gateway",
  "deep_links",
  "theme_read",
  "event_subscribe",
]);

const WINDOW_OPEN_MODES = new Set([
  "smart",
  "current",
  "new_window",
  "reuse_existing",
  "reuse_or_new",
]);

const WINDOW_REUSE_KEYS = new Set([
  "plugin",
  "route",
  "resource",
  "none",
]);

const DIRECT_HOST_IPC_COMMANDS = [
  "plugin_invoke",
  "aichat_send_message",
  "aichat_stop_generation",
  "aichat_create_session",
  "aichat_get_stream_state",
  "aichat_get_model_configs",
  "aichat_get_sessions",
  "devkit_get_profiles",
  "devkit_get_workflows",
  "devkit_get_snippets",
  "devkit_get_directories",
  "devkit_pick_file",
  "devkit_pick_directory",
  "devkit_save_file",
  "plugin_watch_file",
  "plugin_unwatch_file",
];

const IGNORED_PLUGIN_SOURCE_DIRS = new Set([
  ".git",
  "dist",
  "build",
  ".output",
  "node_modules",
  "target",
]);

const SOURCE_FILE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

const PLATFORM_LABELS: Record<string, string> = {
  macos_arm64: "macOS arm64",
  macos_x64: "macOS x64",
  windows_x64: "Windows x64",
  windows_arm64: "Windows arm64",
  linux_x64: "Linux x64",
  linux_arm64: "Linux arm64",
};
