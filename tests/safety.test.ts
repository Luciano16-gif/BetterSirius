import { glob, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedRuntimeLocation } from "../src/safety/runtime-policy";

describe("runtime scope", () => {
  it("accepts only the observed HTTP Sirius portal path", () => {
    expect(isAllowedRuntimeLocation({ origin: "http://sirius.unimet.edu.ve", pathname: "/irj/portal" })).toBe(true);
    expect(isAllowedRuntimeLocation({ origin: "https://sirius.unimet.edu.ve", pathname: "/irj/portal" })).toBe(false);
    expect(isAllowedRuntimeLocation({ origin: "http://sirius.unimet.edu.ve", pathname: "/sap/other" })).toBe(false);
    expect(isAllowedRuntimeLocation({ origin: "http://example.invalid", pathname: "/irj/portal" })).toBe(false);
  });

  it("keeps the manifest minimal and host-restricted", async () => {
    const manifest = JSON.parse(await readFile(resolve("public/manifest.json"), "utf8"));
    expect(manifest.permissions).toEqual([]);
    const allowedHosts = [
      "http://sirius.unimet.edu.ve/*",
      "http://sappro2.unimet.edu.ve/*",
    ];
    expect(manifest.host_permissions).toEqual(allowedHosts);
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0].matches).toEqual(allowedHosts);
    expect(manifest.content_scripts[0].all_frames).toBe(true);
    expect(manifest.content_scripts[0].match_about_blank).toBe(true);
    expect(manifest.content_scripts[0].match_origin_as_fallback).toBe(true);
    expect(manifest.background).toEqual({ service_worker: "background.js" });
  });

  it("contains no network or form-submission primitives in extension source", async () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bsendBeacon\b/,
      /\.requestSubmit\s*\(/,
      /\.submit\s*\(/,
      /\bchrome\.runtime\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bindexedDB\b/,
      /\bconsole\.(?:log|info|debug|warn|error)\b/,
      /\.value\b/,
    ];
    const sourceFiles: string[] = [];
    for await (const file of glob("src/**/*.ts")) sourceFiles.push(file);

    for (const file of sourceFiles) {
      const source = await readFile(file, "utf8");
      for (const pattern of forbidden) expect(source, `${file} contains ${pattern}`).not.toMatch(pattern);
    }
  });
});
