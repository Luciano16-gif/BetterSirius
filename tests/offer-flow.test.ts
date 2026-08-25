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

  it("does not settle an exact-code search on rows from the previous response", () => {
    const current = {
      state: "initial",
      offerings: [],
      query: "SYN200",
      pending: "searching",
    } as const;

    expect(reconcileAcademicOffer(current, {
      state: "results",
      offerings: [{ code: "SYN100", name: "Resultado anterior" }],
    })).toEqual(current);
  });

  it("does not replace an active lookup search with rows from the previous query", () => {
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
        query: "ANTERIOR",
        options: [{ index: 0, code: "SYN-FGE-01", name: "Electiva sintética" }],
      },
    })).toEqual(current);
  });

  it("waits for the controller to validate an empty lookup response", () => {
    const current = {
      state: "initial",
      offerings: [],
      lookup: { state: "initial", options: [], query: "SIN", pending: "searching" },
    } as const;
    expect(reconcileAcademicOffer(current, {
      state: "initial",
      offerings: [],
      lookup: { state: "empty", options: [] },
    })).toEqual(current);
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

  it("accumulates distinct rows while SAP pages a virtualized lookup grid", () => {
    const current = {
      state: "initial",
      offerings: [],
      lookup: {
        state: "results",
        query: "FGE",
        options: [
          { index: 0, code: "SYN-FGE-01", name: "Electiva uno" },
          { index: 1, code: "SYN-FGE-02", name: "Electiva dos" },
        ],
      },
    } as const;

    expect(reconcileAcademicOffer(current, {
      state: "initial",
      offerings: [],
      lookup: {
        state: "results",
        query: "FGE",
        options: [
          { index: 0, code: "SYN-FGE-02", name: "Electiva dos" },
          { index: 1, code: "SYN-FGE-03", name: "Electiva tres" },
        ],
      },
    }).lookup).toEqual({
      state: "results",
      query: "FGE",
      options: [
        { index: 0, code: "SYN-FGE-01", name: "Electiva uno" },
        { index: 1, code: "SYN-FGE-02", name: "Electiva dos" },
        { index: 2, code: "SYN-FGE-03", name: "Electiva tres" },
      ],
    });
  });

  it("replaces remembered rows when Sirius exposes a different native query", () => {
    const current = {
      state: "initial",
      offerings: [],
      lookup: {
        state: "results",
        query: "FGE",
        options: [{ index: 0, code: "SYN-FGE-01", name: "Electiva" }],
      },
    } as const;

    expect(reconcileAcademicOffer(current, {
      state: "initial",
      offerings: [],
      lookup: {
        state: "results",
        query: "Metaverso",
        options: [{ index: 0, code: "SYN-META-01", name: "Metaverso" }],
      },
    }).lookup).toEqual({
      state: "results",
      query: "Metaverso",
      options: [{ index: 0, code: "SYN-META-01", name: "Metaverso" }],
    });
  });
});
