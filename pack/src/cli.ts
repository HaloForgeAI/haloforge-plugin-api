#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Command } from "commander";
import chalk from "chalk";
import { checkPlugin, infoTarget, packPlugin } from "./core.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const program = new Command()
  .name("hf-pack")
  .description("Validate, build, and bundle HaloForge plugins into .hfpkg archives")
  .version(packageJson.version)
  .showSuggestionAfterError();

program
  .command("check")
  .argument("<plugin-dir>", "path to the plugin directory")
  .action(wrap(async (pluginDir: string) => {
    await checkPlugin(pluginDir);
  }));

program
  .command("info")
  .argument("<path>", "path to a plugin directory or .hfpkg archive")
  .action(wrap(async (targetPath: string) => {
    await infoTarget(targetPath);
  }));

program
  .command("pack")
  .argument("<plugin-dir>", "path to the plugin directory")
  .option("-o, --out <dir>", "output directory for the .hfpkg file")
  .option("-r, --release", "build backend and frontend in release mode", false)
  .option("--no-backend", "skip building the Rust backend and package prebuilt native files")
  .option("--no-frontend", "skip building the frontend and package prebuilt frontend files")
  .option("--target <triple>", "Rust compilation target triple")
  .action(wrap(async (pluginDir: string, options: {
    out?: string;
    release?: boolean;
    backend?: boolean;
    frontend?: boolean;
    target?: string;
  }) => {
    await packPlugin(pluginDir, {
      out: options.out,
      release: options.release,
      noBackend: options.backend === false,
      noFrontend: options.frontend === false,
      target: options.target,
    });
  }));

await program.parseAsync(process.argv);

function wrap<T extends unknown[]>(action: (...args: T) => Promise<void>) {
  return async (...args: T): Promise<void> => {
    try {
      await action(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${chalk.red.bold("error:")} ${message}`);
      process.exitCode = 1;
    }
  };
}