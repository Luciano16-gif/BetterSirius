import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameRegistry, type RegistrySnapshot } from "../src/registry/frame-registry";
import { readAcademicOffer } from "../src/academic/offer";
import { detectApplication } from "../src/detection/application-detector";
import { documentText } from "../src/detection/text";

afterEach(() => {
  document.body.replaceChildren();
});

describe("frame registry", () => {
  it("discards replaced iframe instances and publishes the new fingerprint", () => {
    const listener = vi.fn<(snapshot: RegistrySnapshot) => void>();
    const first = document.createElement("iframe");
    first.src = "/sap/bc/webdynpro/sap/zweb_calificaciones";
    document.body.append(first);

    const registry = new FrameRegistry(document, listener);
    registry.start();
    expect(listener.mock.lastCall?.[0].applications).toEqual([
      expect.objectContaining({ application: "historical-grades" }),
    ]);

    const replacement = document.createElement("iframe");
    replacement.src = "/sap/bc/webdynpro/sap/zweb_oferta_1";
    first.replaceWith(replacement);
    registry.scan();

    expect(listener.mock.lastCall?.[0].applications).toEqual([
      expect.objectContaining({ application: "academic-offer" }),
    ]);
    registry.stop();
  });

  it("publishes a newly rendered state after the current iframe loads", () => {
    const listener = vi.fn<(snapshot: RegistrySnapshot) => void>();
    const frame = document.createElement("iframe");
    frame.src = "/sap/bc/webdynpro/sap/zweb_matricula2";
    document.body.append(frame);

    const registry = new FrameRegistry(document, listener);
    registry.start();
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Synthetic iframe document was not created.");
    const body = frameDocument.createElement("body");
    body.innerHTML = "<h1>Selección del plan de estudio</h1><button>Continuar</button>";
    if (frameDocument.documentElement) frameDocument.documentElement.append(body);
    else {
      const html = frameDocument.createElement("html");
      html.append(body);
      frameDocument.append(html);
    }
    frame.dispatchEvent(new Event("load"));

    expect(listener.mock.lastCall?.[0].applications).toEqual([
      expect.objectContaining({ application: "registration", state: "initial" }),
    ]);
    registry.stop();
  });

  it("publishes normalized academic history and follows passive DOM updates", async () => {
    const listener = vi.fn<(snapshot: RegistrySnapshot) => void>();
    const frame = document.createElement("iframe");
    frame.src = "/sap/bc/webdynpro/sap/zweb_calificaciones";
    document.body.append(frame);

    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Synthetic iframe document was not created.");
    const body = frameDocument.createElement("body");
    body.innerHTML = `
      <h1>Historial académico</h1>
      <table><tr><th>Código</th><th>Asignatura</th><th>Calificación</th></tr>
      <tr><td>SYN-1</td><td>Materia local</td><td>A</td></tr></table>`;
    if (frameDocument.documentElement) frameDocument.documentElement.append(body);
    else {
      const html = frameDocument.createElement("html");
      html.append(body);
      frameDocument.append(html);
    }

    const registry = new FrameRegistry(document, listener);
    registry.start();

    expect(listener.mock.lastCall?.[0].academicHistory).toEqual({
      state: "results",
      courses: [{ code: "SYN-1", name: "Materia local", grade: "A" }],
    });

    body.querySelector("table")?.insertAdjacentHTML(
      "beforeend",
      "<tr><td>SYN-2</td><td>Segunda materia</td><td>B</td></tr>",
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(listener.mock.lastCall?.[0].academicHistory.courses).toHaveLength(2);
    registry.stop();
  });

  it("publishes normalized academic-offer rows from the current iframe", () => {
    const listener = vi.fn<(snapshot: RegistrySnapshot) => void>();
    const frame = document.createElement("iframe");
    frame.src = "/sap/bc/webdynpro/sap/zweb_oferta_1";
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Synthetic iframe document was not created.");
    frameDocument.title = "ZWEB_OFERTA_1 [Web Dynpro para ABAP]";
    const body = frameDocument.createElement("body");
    body.innerHTML = `
      <table>
        <tr><th>Código</th><th>Asignatura</th><th>Bloque</th><th>Horario</th><th>Cupo</th></tr>
        <tr><td>SYN100</td><td>Materia sintética</td><td>01</td><td>LU 08:00</td><td>24</td></tr>
      </table>`;
    if (frameDocument.documentElement) frameDocument.documentElement.append(body);
    else {
      const html = frameDocument.createElement("html");
      html.append(body);
      frameDocument.append(html);
    }

    const registry = new FrameRegistry(document, listener);
    registry.start();

    expect(listener.mock.lastCall?.[0].academicOffer).toEqual({
      state: "results",
      offerings: [{
        code: "SYN100",
        name: "Materia sintética",
        block: "01",
        schedule: "LU 08:00",
        schedules: ["LU 08:00"],
        capacity: "24",
      }],
    });
    registry.stop();
  });

  it("merges the native academic-offer selector with the main offer frame", () => {
    const listener = vi.fn<(snapshot: RegistrySnapshot) => void>();
    const mainFrame = document.createElement("iframe");
    const lookupFrame = document.createElement("iframe");
    mainFrame.src = "/sap/bc/webdynpro/sap/zweb_oferta_1";
    document.body.append(mainFrame, lookupFrame);
    const mainDocument = mainFrame.contentDocument;
    const lookupDocument = lookupFrame.contentDocument;
    if (!mainDocument || !lookupDocument) throw new Error("Synthetic iframe documents were not created.");
    mainDocument.title = "ZWEB_OFERTA_1";
    const mainBody = mainDocument.createElement("body");
    mainBody.innerHTML = `
      <span class="lsLabel">Código de Asignatura</span><input type="text">
      <div class="lsButton" tabindex="0">Buscar</div>`;
    if (mainDocument.documentElement) mainDocument.documentElement.append(mainBody);
    else {
      const html = mainDocument.createElement("html");
      html.append(mainBody);
      mainDocument.append(html);
    }
    if (!lookupDocument.documentElement) throw new Error("Synthetic lookup root is missing.");
    lookupDocument.documentElement.innerHTML = `
      <head><title>Búsqueda: Código de Asignatura</title></head>
      <body>
        <h1>Búsqueda: Código de Asignatura</h1>
        <input type="text" title="Nombre o Código de la asignatura">
        <div class="lsButton" tabindex="0">Buscar</div>
        <table><tr><th>Abrev. objeto</th><th>Denominación</th></tr>
        <tr><td>SYN-FGE-01</td><td>Electiva sintética</td></tr></table>
      </body>`;

    expect(documentText(lookupDocument)).toContain("busqueda: codigo de asignatura");
    expect(detectApplication(lookupDocument)?.application).toBe("academic-offer");
    expect(readAcademicOffer(lookupDocument).lookup?.state).toBe("results");

    const registry = new FrameRegistry(document, listener);
    registry.start();

    expect(listener.mock.lastCall?.[0].academicOffer).toEqual({
      state: "initial",
      offerings: [],
      lookup: {
        state: "results",
        options: [{ index: 0, code: "SYN-FGE-01", name: "Electiva sintética" }],
      },
    });
    registry.stop();
  });
});
