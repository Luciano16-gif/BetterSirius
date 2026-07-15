import { describe, expect, it } from "vitest";
import { AcademicHistoryFlow } from "../src/academic/history-flow";
import type { AcademicHistoryModel } from "../src/core/types";

const PROGRAMS: AcademicHistoryModel = {
  state: "initial",
  courses: [],
  programs: [{ index: 1, label: "Programa sintético" }],
};

describe("academic history flow", () => {
  it("holds the program loading state across intermediate initial and unavailable frames", () => {
    const flow = new AcademicHistoryFlow(PROGRAMS);

    expect(flow.begin("program", PROGRAMS)).toMatchObject({ state: "initial", pending: "program" });
    expect(flow.reconcile({ state: "unavailable", courses: [] })).toMatchObject({
      state: "initial",
      pending: "program",
    });
    expect(flow.reconcile({ state: "initial", courses: [] })).toMatchObject({
      state: "initial",
      pending: "program",
    });
    expect(flow.reconcile({ state: "results", courses: [{ code: "SYN", name: "Materia" }] })).toEqual({
      state: "results",
      courses: [{ code: "SYN", name: "Materia" }],
    });
  });

  it("settles a period change only when the requested period becomes active", () => {
    const periods = [
      { index: 1, code: "SYN-NEW", academicYear: "2100", label: "Reciente", active: true },
      { index: 2, code: "SYN-OLD", academicYear: "2099", label: "Anterior", active: false },
    ];
    const current: AcademicHistoryModel = {
      state: "results",
      courses: [{ code: "SYN-NEW", name: "Reciente" }],
      periods,
    };
    const flow = new AcademicHistoryFlow(current);
    flow.begin("period", current, "SYN-OLD");

    expect(flow.reconcile(current).pending).toBe("period");
    expect(flow.reconcile({
      state: "empty",
      courses: [],
      periods: periods.map((period) => ({ ...period, active: period.code === "SYN-OLD" })),
    })).toEqual({
      state: "empty",
      courses: [],
      periods: periods.map((period) => ({ ...period, active: period.code === "SYN-OLD" })),
    });
  });

  it("releases the latest observed state when a slow operation expires", () => {
    const flow = new AcademicHistoryFlow(PROGRAMS);
    flow.begin("program", PROGRAMS);
    flow.reconcile({ state: "unknown", courses: [] });

    expect(flow.expire()).toEqual({ state: "unknown", courses: [] });
  });
});
