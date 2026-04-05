import AdmZip from "adm-zip";
import chalk from "chalk";
import { spawn } from "node:child_process";
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
  compatibility: {
    min_app_version: string;
    max_app_version?: string;
    platforms?: string[];
  };
  capability_levels: number[];
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

export interface PackOptions {
  out?: string;
  release?: boolean;
  noBackend?: boolean;
  noFrontend?: boolean;
  target?: string;
}

export async function checkPlugin(pluginDirPath: string): Promise<void> {
  const { manifest } = await loadManifest(pluginDirPath);
  console.log(
    `${chalk.green("✓")} manifest is valid for ${chalk.bold(manifest.name)} v${chalk.yellow(manifest.version)}`,
  );
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

    console.log(`\n${chalk.green.bold("Created")} ${packagePath}`);
    console.log(`  ${fileCount} files  ${chalk.cyan(formatSize(packageStats.size))}`);
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
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

  if (!Array.isArray(manifest.capability_levels) || manifest.capability_levels.length === 0) {
    throw new Error("manifest.capability_levels must contain at least one capability level");
  }
  for (const level of manifest.capability_levels) {
    if (!Number.isInteger(level) || level < 0 || level > 4) {
      throw new Error(`invalid capability level: ${String(level)}`);
    }
  }

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
  } else if (!frontendDir) {
    console.log(`  ${chalk.dim("skip frontend build")} no package.json found`);
  } else {
    console.log(`  ${chalk.dim("skip frontend build")} using prebuilt frontend assets`);
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
  native[field] = relativePath;
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

const PLATFORM_LABELS: Record<string, string> = {
  macos_arm64: "macOS arm64",
  macos_x64: "macOS x64",
  windows_x64: "Windows x64",
  windows_arm64: "Windows arm64",
  linux_x64: "Linux x64",
  linux_arm64: "Linux arm64",
};