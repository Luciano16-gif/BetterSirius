import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { context } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, ".preview");
const portArgumentIndex = process.argv.indexOf("--port");
const requestedPort = portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : 4173;

if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
  throw new Error("Preview port must be an integer between 1024 and 65535.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(resolve(outputDirectory, "assets"), { recursive: true });
await cp(resolve(root, "dev/index.html"), resolve(outputDirectory, "index.html"));

const buildContext = await context({
  entryPoints: [resolve(root, "dev/preview.ts")],
  outfile: resolve(outputDirectory, "assets/preview.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  sourcemap: true,
});

await buildContext.watch();
const server = await buildContext.serve({ servedir: outputDirectory, port: requestedPort });
console.log(`Synthetic preview available at http://${server.host}:${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await buildContext.dispose();
    process.exit(0);
  });
}
