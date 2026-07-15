import { describe, expect, it } from "vitest";
import { academicProcessCatalog, readAcademicProcesses } from "../src/academic/processes";
import { fixtureDocument } from "./helpers/fixture";

describe("academic process parser", () => {
  it("returns only the 11 allowlisted academic routes from a synthetic portal menu", () => {
    const model = readAcademicProcesses(fixtureDocument("portal-academic-processes.html"));

    expect(model.groups).toHaveLength(7);
    expect(model.totalCount).toBe(11);
    expect(model.detectedCount).toBe(11);
    expect(model.groups.flatMap((group) => group.processes).map((process) => process.label)).not.toContain(
      "Proceso inventado que no debe salir",
    );
  });

  it("does not accept near matches or arbitrary visible text", () => {
    const document = new DOMParser().parseFromString(
      '<a href="#">Oferta Académica de Postgrado</a><p>Consulta Calificaciones Históricas</p>',
      "text/html",
    );

    expect(readAcademicProcesses(document).detectedCount).toBe(0);
  });

  it("classifies consequential processes as blocked", () => {
    const processes = academicProcessCatalog().groups.flatMap((group) => group.processes);
    const blocked = processes.filter((process) => process.mode === "blocked").map((process) => process.id);

    expect(blocked).toEqual([
      "registration",
      "enrollment-certificate",
      "course-withdrawal",
      "personal-data",
      "unimet-email",
    ]);
  });
});
