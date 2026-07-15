import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/content/index.ts")],
  outfile: resolve(outputDirectory, "content.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  sourcemap: false,
  minify: false,
  legalComments: "inline",
});

await cp(resolve(root, "public/manifest.json"), resolve(outputDirectory, "manifest.json"));

const manifest = JSON.parse(await readFile(resolve(outputDirectory, "manifest.json"), "utf8"));
const allowedPattern = "http://sirius.unimet.edu.ve/irj/*";

if (
  manifest.permissions.length !== 0 ||
  manifest.host_permissions.length !== 1 ||
  manifest.host_permissions[0] !== allowedPattern ||
  manifest.content_scripts[0]?.matches?.length !== 1 ||
  manifest.content_scripts[0].matches[0] !== allowedPattern
) {
  throw new Error("Manifest safety check failed: Sirius must be the only allowed host.");
}

console.log("Built BetterSirius in dist/ with the Sirius-only manifest policy.");

