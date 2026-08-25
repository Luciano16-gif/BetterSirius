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

await build({
  entryPoints: [resolve(root, "src/background/index.ts")],
  outfile: resolve(outputDirectory, "background.js"),
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
const allowedPatterns = [
  "http://sirius.unimet.edu.ve/*",
  "http://sappro2.unimet.edu.ve/*",
];

if (
  manifest.permissions.length !== 0 ||
  JSON.stringify(manifest.host_permissions) !== JSON.stringify(allowedPatterns) ||
  JSON.stringify(manifest.content_scripts[0]?.matches) !== JSON.stringify(allowedPatterns) ||
  manifest.content_scripts[0]?.all_frames !== true ||
  manifest.content_scripts[0]?.match_about_blank !== true ||
  manifest.content_scripts[0]?.match_origin_as_fallback !== true
  || manifest.background?.service_worker !== "background.js"
) {
  throw new Error("Manifest safety check failed: Sirius must be the only allowed host.");
}

console.log("Built BetterSirius in dist/ with the Sirius-only manifest policy.");
