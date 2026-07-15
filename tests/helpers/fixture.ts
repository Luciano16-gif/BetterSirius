import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function fixtureDocument(name: string): Document {
  const html = readFileSync(resolve(import.meta.dirname, "../fixtures", name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

