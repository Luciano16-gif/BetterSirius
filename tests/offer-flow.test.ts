import { describe, expect, it } from "vitest";
import { reconcileAcademicOffer } from "../src/academic/offer-flow";

describe("academic offer flow", () => {
  it("keeps opening while Web Dynpro passes through unavailable and unknown states", () => {
    const current = { state: "unavailable", offerings: [], pending: "opening" } as const;

    expect(reconcileAcademicOffer(current, { state: "unavailable", offerings: [] })).toEqual(current);
    expect(reconcileAcademicOffer(current, { state: "unknown", offerings: [] })).toEqual(current);
    expect(reconcileAcademicOffer(current, { state: "initial", offerings: [] })).toEqual({
      state: "initial",
      offerings: [],
    });
  });

  it("does not replace an active lookup search with the selector's initial shell", () => {
    const current = {
      state: "initial",
      offerings: [],
      lookup: {
        state: "initial",
        options: [],
        query: "FGE",
        pending: "searching",
      },
    } as const;

    expect(reconcileAcademicOffer(current, {
      state: "initial",
      offerings: [],
      lookup: { state: "initial", options: [] },
    })).toEqual(current);
    expect(reconcileAcademicOffer(current, {
      state: "initial",
      offerings: [],
      lookup: {
        state: "results",
        options: [{ index: 0, code: "SYN-FGE-01", name: "Electiva sintética" }],
      },
    })).toEqual({
      state: "initial",
      offerings: [],
      lookup: {
        state: "results",
        options: [{ index: 0, code: "SYN-FGE-01", name: "Electiva sintética" }],
        query: "FGE",
      },
    });
  });

  it("settles a lookup search on a valid empty response", () => {
    const current = {
      state: "initial",
      offerings: [],
      lookup: { state: "initial", options: [], query: "SIN", pending: "searching" },
    } as const;
    expect(reconcileAcademicOffer(current, {
      state: "initial",
      offerings: [],
      lookup: { state: "empty", options: [] },
    })).toEqual({
      state: "initial",
      offerings: [],
      lookup: { state: "empty", options: [], query: "SIN" },
    });
  });

  it("keeps verified lookup results in memory after the native selector closes", () => {
    const current = {
      state: "results",
      offerings: [{ code: "SYN-FGE-01", name: "Electiva sintética" }],
      query: "SYN-FGE-01",
      lookup: {
        state: "results",
        query: "FGE",
        options: [
          { index: 0, code: "SYN-FGE-01", name: "Electiva sintética" },
          { index: 1, code: "SYN-FGE-02", name: "Otra electiva sintética" },
        ],
      },
    } as const;

    expect(reconcileAcademicOffer(current, {
      state: "results",
      offerings: [{ code: "SYN-FGE-02", name: "Otra electiva sintética" }],
    })).toEqual({
      state: "results",
      offerings: [{ code: "SYN-FGE-02", name: "Otra electiva sintética" }],
      query: "SYN-FGE-01",
      lookup: current.lookup,
    });
  });
});
