import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameRegistry, type RegistrySnapshot } from "../src/registry/frame-registry";

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
});
