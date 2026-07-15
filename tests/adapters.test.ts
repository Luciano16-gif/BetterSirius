import { describe, expect, it } from "vitest";
import { READ_ONLY_ADAPTERS } from "../src/adapters/read-only-adapters";
import { fixtureDocument } from "./helpers/fixture";

describe("read-only adapter boundary", () => {
  it("keeps every SAP action locator inert", () => {
    const registration = fixtureDocument("registration-initial.html");
    for (const adapter of READ_ONLY_ADAPTERS) {
      expect(adapter.locateAction(registration, "select-view")).toBeNull();
      expect(adapter.locateAction(registration, "refresh-view")).toBeNull();
    }
  });

  it("classifies errors without exposing document content", () => {
    const adapter = READ_ONLY_ADAPTERS[0];
    expect(adapter?.classifyError(fixtureDocument("sap-error.html"))).toMatchObject({
      kind: "server-error",
      recoverable: false,
    });
  });
});

