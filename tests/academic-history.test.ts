import { describe, expect, it } from "vitest";
import { readAcademicHistory } from "../src/academic/history";
import { fixtureDocument } from "./helpers/fixture";

describe("academic history parser", () => {
  it("normalizes the synthetic SAP result table", () => {
    const model = readAcademicHistory(fixtureDocument("historical-grades-results.html"));

    expect(model.state).toBe("results");
    expect(model.courses).toEqual([
      {
        period: "2026-S1",
        code: "SYN-204",
        name: "Materia sintética",
        grade: "A",
        approvedCredits: "4",
        attemptedCredits: "4",
        points: "16",
        comments: "Fixture local",
      },
      {
        period: "2026-S1",
        code: "SYN-108",
        name: "Laboratorio de prueba",
        grade: "B",
        approvedCredits: "3",
        attemptedCredits: "3",
        points: "9",
      },
    ]);
  });

  it("recognizes program selection without inventing results", () => {
    expect(readAcademicHistory(fixtureDocument("historical-grades-initial.html"))).toEqual({
      state: "initial",
      courses: [],
    });
  });

  it("reads the abbreviated headers used by the observed SAP result table", () => {
    expect(readAcademicHistory(fixtureDocument("historical-grades-sap-results.html"))).toEqual({
      state: "results",
      courses: [
        {
          code: "SYN-101",
          name: "Materia local",
          grade: "A",
          approvedCredits: "3",
          attemptedCredits: "3",
          points: "9",
        },
        {
          code: "SYN-202",
          name: "Laboratorio local",
          grade: "RE",
          attemptedCredits: "2",
          points: "0",
          comments: "Retirada",
        },
      ],
    });
  });

  it("treats a compatible result table with no course rows as a valid empty period", () => {
    expect(readAcademicHistory(fixtureDocument("historical-grades-sap-empty-period.html"))).toEqual({
      state: "empty",
      courses: [],
    });
  });

  it("reads a compatible result table rendered in a nested same-origin iframe", () => {
    const outer = document.createElement("iframe");
    document.body.append(outer);
    const root = outer.contentDocument;
    if (!root) throw new Error("Synthetic outer iframe document was not created.");
    root.title = "Consulta Calificaciones Historicas";

    const nested = root.createElement("iframe");
    root.body.append(nested);
    const nestedDocument = nested.contentDocument;
    if (!nestedDocument) throw new Error("Synthetic iframe document was not created.");
    nestedDocument.body.innerHTML = `
      <table>
        <tr><th>Codigo</th><th>Asignatura</th><th>Calificacion</th></tr>
        <tr><td>SYN-NESTED</td><td>Materia anidada</td><td>A</td></tr>
      </table>`;
    expect(readAcademicHistory(root)).toEqual({
      state: "results",
      courses: [{ code: "SYN-NESTED", name: "Materia anidada", grade: "A" }],
    });
    outer.remove();
  });

  it("ignores unrelated tables and requires academic result columns", () => {
    const document = new DOMParser().parseFromString(
      "<title>Historial académico</title><table><tr><th>Código</th><th>Asignatura</th></tr><tr><td>X</td><td>Texto</td></tr></table>",
      "text/html",
    );
    expect(readAcademicHistory(document)).toEqual({ state: "unknown", courses: [] });
  });
});
