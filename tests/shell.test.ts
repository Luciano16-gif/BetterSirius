import { afterEach, describe, expect, it, vi } from "vitest";
import { SHELL_HOST_ID } from "../src/core/constants";
import type { ShellModel } from "../src/core/types";
import { academicProcessCatalog } from "../src/academic/processes";
import { mountBetterSiriusShell } from "../src/ui/shell";

const readyModel: ShellModel = {
  portalState: "portal-shell",
  applications: [{ application: "historical-grades", state: "results", confidence: 1 }],
  academicProcesses: academicProcessCatalog(true),
  academicHistory: {
    state: "results",
    courses: [{ period: "2026-S1", code: "SYN-204", name: "Materia sintética", grade: "A", approvedCredits: "4" }],
  },
  academicOffer: { state: "initial", offerings: [] },
};

afterEach(() => {
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("responsive shell", () => {
  it("mounts without removing the original document", () => {
    document.body.innerHTML = '<main id="sap-original">Synthetic SAP content</main>';
    const controller = mountBetterSiriusShell(document, readyModel);
    const host = document.getElementById(SHELL_HOST_ID);

    expect(document.getElementById("sap-original")).not.toBeNull();
    expect(host?.shadowRoot?.textContent).toContain("Procesos Académicos");
    expect(host?.shadowRoot?.querySelector(".navigation")?.textContent).not.toContain("Historial");
    expect(host?.shadowRoot?.querySelector("[data-panel='home'] form")).toBeNull();
    controller.dispose();
  });

  it("always provides a round trip to the untouched UI", () => {
    const controller = mountBetterSiriusShell(document, readyModel);
    const host = document.getElementById(SHELL_HOST_ID) as HTMLElement;
    const originalButton = host.shadowRoot?.querySelector<HTMLButtonElement>("[data-show-original]");
    const returnButton = host.shadowRoot?.querySelector<HTMLButtonElement>(".return-button");
    const viewport = host.shadowRoot?.querySelector<HTMLElement>(".viewport");

    expect(document.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(
      "width=device-width, initial-scale=1, viewport-fit=cover",
    );

    originalButton?.click();
    expect(host.dataset.mode).toBe("original");
    expect(returnButton?.hidden).toBe(false);
    expect(viewport?.hidden).toBe(true);
    expect(viewport?.style.display).toBe("none");
    expect(host.style.width).toBe("max-content");
    expect(host.style.height).toBe("max-content");
    expect(document.querySelector('meta[name="viewport"]')).toBeNull();

    returnButton?.click();
    expect(host.dataset.mode).toBe("enhanced");
    expect(viewport?.hidden).toBe(false);
    expect(viewport?.style.display).toBe("");
    expect(host.style.width).toBe("");
    expect(host.style.height).toBe("");
    expect(document.querySelector('meta[name="viewport"]')).not.toBeNull();
    controller.dispose();
    expect(document.querySelector('meta[name="viewport"]')).toBeNull();
  });

  it("uses a blue-led UNIMET palette with orange accents without recreating its logo", () => {
    const controller = mountBetterSiriusShell(document, readyModel);
    const style = document
      .getElementById(SHELL_HOST_ID)
      ?.shadowRoot?.querySelector("style")
      ?.textContent?.toLowerCase();

    expect(style).toContain("#003087");
    expect(style).toContain("#f68629");
    expect(style).toMatch(/\.sidebar\s*\{[^}]*background:\s*var\(--blue\)/);
    expect(style).toMatch(/\.brand-mark\s*\{[^}]*background:\s*var\(--accent\)/);
    expect(style).toContain(".viewport[hidden]");
    controller.dispose();
  });

  it("keeps consequential catalog items inert and exposes the supported read actions", () => {
    const controller = mountBetterSiriusShell(document, readyModel);
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    const academicButton = shadow?.querySelector<HTMLButtonElement>("[data-view='academic']");

    academicButton?.click();

    const panel = shadow?.querySelector<HTMLElement>("[data-panel='academic']");
    expect(panel?.hidden).toBe(false);
    expect(panel?.querySelectorAll(".process-row")).toHaveLength(11);
    expect(
      Array.from(panel?.querySelectorAll<HTMLDetailsElement>("details.process-group") ?? []).every(
        (group) => !group.open,
      ),
    ).toBe(true);
    expect(panel?.querySelectorAll(".process-row-action")).toHaveLength(3);
    expect(panel?.textContent).toContain("Matrícula Pregrado");
    expect(panel?.textContent).toContain("Horario del Estudiante Completo");
    expect(panel?.textContent).toContain("Consultas y Solicitudes");
    expect(panel?.textContent).toContain("Cursos en Línea");
    expect(panel?.querySelectorAll(".process-mode")).toHaveLength(0);
    controller.dispose();
  });

  it("opens Oferta Académica and submits one explicit code search", async () => {
    const search = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(document, readyModel, { onSearchAcademicOffer: search });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>("[data-view='academic']")?.click();
    shadow?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")?.click();
    const form = shadow?.querySelector<HTMLFormElement>("[data-offer-search-form]");
    const input = form?.querySelector<HTMLInputElement>("input[name='course-code']");
    if (!form || !input) throw new Error("Synthetic offer form is missing.");
    input.value = "syn100";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(shadow?.querySelector<HTMLElement>("[data-panel='offer']")?.hidden).toBe(false);
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith("SYN100");
    controller.dispose();
  });

  it("opens the native subject selector from the academic-offer search", async () => {
    const openLookup = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(document, readyModel, {
      onOpenAcademicOfferLookup: openLookup,
    });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")?.click();
    shadow?.querySelector<HTMLButtonElement>("[data-open-offer-lookup]")?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(openLookup).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("searches the selector explicitly and delegates an exact result choice", async () => {
    const searchLookup = vi.fn().mockResolvedValue("activated" as const);
    const selectLookup = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(
      document,
      {
        ...readyModel,
        academicOffer: {
          state: "initial",
          offerings: [],
          lookup: {
            state: "results",
            query: "FGE",
            options: [
              { index: 0, code: "SYN-FGE-01", name: "Electiva sintética de cultura" },
            ],
          },
        },
      },
      {
        onSearchAcademicOfferLookup: searchLookup,
        onSelectAcademicOfferLookup: selectLookup,
      },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")?.click();
    const form = shadow?.querySelector<HTMLFormElement>("[data-offer-lookup-form]");
    const input = form?.querySelector<HTMLInputElement>("input[name='lookup-query']");
    if (!form || !input) throw new Error("Synthetic offer lookup form is missing.");
    input.value = "psicología";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(searchLookup).toHaveBeenCalledWith("psicología");
    const option = shadow?.querySelector<HTMLButtonElement>("[data-offer-lookup-option]");
    option?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(selectLookup).toHaveBeenCalledWith({
      index: 0,
      code: "SYN-FGE-01",
      name: "Electiva sintética de cultura",
    });
    controller.dispose();
  });

  it("clears the academic-offer navigation message after Sirius accepts the route", async () => {
    const open = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(
      document,
      { ...readyModel, academicOffer: { state: "unavailable", offerings: [] } },
      { onOpenAcademicOffer: open },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(open).toHaveBeenCalledOnce();
    expect(shadow?.querySelector<HTMLElement>("[data-offer-action-status]")?.hidden).toBe(true);
    controller.dispose();
  });

  it("renders offer sections as readable rows instead of a twelve-column table", () => {
    const controller = mountBetterSiriusShell(document, {
      ...readyModel,
      academicOffer: {
        state: "results",
        query: "SYN100",
        offerings: [
          {
            code: "SYN100",
            name: "Materia sintética",
            credits: "4",
            period: "SYN-P1",
            blockDescription: "Sección 01",
            schedule: "LU 08:00–10:00",
            schedules: ["Lu-08:45-10:15", "Mi-10:30-12:00"],
            capacity: "24",
            modality: "Presencial",
          },
        ],
      },
    });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")?.click();

    const offerPanel = shadow?.querySelector<HTMLElement>("[data-panel='offer']");
    expect(offerPanel?.querySelectorAll(".offer-row")).toHaveLength(1);
    expect(offerPanel?.querySelector("table")).toBeNull();
    expect(offerPanel?.textContent).toContain("Lunes");
    expect(offerPanel?.textContent).toContain("08:45-10:15");
    expect(offerPanel?.textContent).toContain("Miércoles");
    expect(offerPanel?.textContent).toContain("10:30-12:00");
    expect(offerPanel?.textContent).toContain("Presencial");
    controller.dispose();
  });

  it("keeps exact-code sections below the code form and lookup matches below the selector", () => {
    const controller = mountBetterSiriusShell(document, {
      ...readyModel,
      academicOffer: {
        state: "results",
        query: "SYN100",
        offerings: [{
          code: "SYN100",
          name: "Materia sintética",
          blockDescription: "Sección 01",
          schedule: "LU 08:00–10:00",
        }],
        lookup: {
          state: "results",
          query: "SYN",
          options: [{ index: 0, code: "SYN100", name: "Materia sintética" }],
        },
      },
    });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")?.click();
    const view = shadow?.querySelector<HTMLElement>("[data-offer-view]");
    const search = view?.querySelector("[data-offer-search-form]");
    const sections = view?.querySelector(".offer-result-heading");
    const lookup = view?.querySelector("[data-offer-lookup]");
    if (!search || !sections || !lookup) throw new Error("Synthetic offer regions are missing.");

    expect(search.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sections.compareDocumentPosition(lookup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    controller.dispose();
  });

  it("shows exact-code progress inline without hiding an open selector", () => {
    const controller = mountBetterSiriusShell(document, {
      ...readyModel,
      academicOffer: {
        state: "initial",
        offerings: [],
        query: "SYN100",
        pending: "searching",
        lookup: {
          state: "results",
          query: "SYN",
          options: [{ index: 0, code: "SYN100", name: "Materia sintética" }],
        },
      },
    });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")?.click();
    const view = shadow?.querySelector<HTMLElement>("[data-offer-view]");

    expect(view?.querySelector("[data-offer-search-form]")).not.toBeNull();
    expect(view?.querySelector(".offer-loading.inline")?.textContent).toContain("Buscando SYN100");
    expect(view?.querySelector("[data-offer-lookup]")).not.toBeNull();
    controller.dispose();
  });

  it("opens Consulta de Calificaciones Período as its own read-only route", async () => {
    const action = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(
      document,
      { ...readyModel, academicHistory: { state: "unavailable", courses: [] } },
      { onOpenPeriodGrades: action },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>("[data-view='academic']")?.click();
    shadow?.querySelector<HTMLButtonElement>("[data-open-period-grades]")?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(action).toHaveBeenCalledOnce();
    expect(shadow?.querySelector<HTMLElement>("[data-panel='history']")?.hidden).toBe(false);
    expect(shadow?.querySelector("[data-history-title]")?.textContent).toBe(
      "Consulta de Calificaciones Período",
    );
    expect(shadow?.querySelector("[data-history-action-status]")?.textContent).toBe(
      "Esperando la respuesta de Sirius…",
    );
    controller.dispose();
  });

  it("reuses an already readable grade application without activating Sirius again", async () => {
    const action = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(document, readyModel, { onOpenPeriodGrades: action });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>("[data-view='academic']")?.click();
    shadow?.querySelector<HTMLButtonElement>("[data-open-period-grades]")?.click();
    await Promise.resolve();

    expect(action).not.toHaveBeenCalled();
    expect(shadow?.querySelector("[data-history-view]")?.textContent).toContain("SYN-204");
    expect(shadow?.querySelector<HTMLElement>("[data-history-action-status]")?.hidden).toBe(true);
    controller.dispose();
  });

  it.each([
    [{ state: "initial", courses: [] } as const, "Selecciona un programa académico"],
    [{ state: "initial", courses: [], pending: "opening" } as const, "Abriendo Consulta de Calificaciones Período"],
    [readyModel.academicHistory, "SYN-204"],
    [{ state: "empty", courses: [] } as const, "No hay materias en este período"],
    [{ state: "unknown", courses: [] } as const, "La pantalla no es reconocible"],
  ])("renders the period-grade route safely for %#", (academicHistory, expectedText) => {
    const controller = mountBetterSiriusShell(document, { ...readyModel, academicHistory });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>("[data-view='academic']")?.click();
    shadow?.querySelector<HTMLButtonElement>("[data-open-period-grades]")?.click();

    expect(shadow?.querySelector("[data-history-title]")?.textContent).toBe(
      "Consulta de Calificaciones Período",
    );
    expect(shadow?.querySelector("[data-history-view]")?.textContent).toContain(expectedText);
    controller.dispose();
  });

  it("opens only the academic group selected from the navigation tree", () => {
    const controller = mountBetterSiriusShell(document, readyModel);
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>("[data-academic-focus='requests']")?.click();

    const groups = Array.from(
      shadow?.querySelectorAll<HTMLDetailsElement>("details.process-group") ?? [],
    );
    expect(groups.find((group) => group.dataset.academicGroup === "requests")?.open).toBe(true);
    expect(
      groups
        .filter((group) => group.dataset.academicGroup !== "requests")
        .every((group) => !group.open),
    ).toBe(true);
    controller.dispose();
  });

  it("delegates an explicit Open History action and reports progress", async () => {
    const action = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(
      document,
      { ...readyModel, academicHistory: { state: "unavailable", courses: [] } },
      { onOpenHistoricalGrades: action },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    shadow?.querySelector<HTMLButtonElement>("[data-panel='history'] [data-open-history]")?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(action).toHaveBeenCalledOnce();
    expect(shadow?.querySelector("[data-history-action-status]")?.textContent).toBe(
      "Esperando la respuesta de Sirius…",
    );
    controller.dispose();
  });

  it("delegates an explicit visible program choice", async () => {
    const action = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(
      document,
      {
        ...readyModel,
        academicHistory: {
          state: "initial",
          courses: [],
          programs: [{ index: 1, label: "Programa sintético" }],
        },
      },
      { onSelectHistoricalProgram: action },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    const program = shadow?.querySelector<HTMLButtonElement>("[data-history-program]");
    program?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(action).toHaveBeenCalledWith({ index: 1, label: "Programa sintético" });
    expect(program?.textContent).toContain("Cargando historial");
    controller.dispose();
  });

  it("keeps a stable loading surface while Sirius replaces the program frame", () => {
    const controller = mountBetterSiriusShell(document, {
      ...readyModel,
      academicHistory: {
        state: "initial",
        courses: [],
        programs: [{ index: 1, label: "Programa sintético" }],
        pending: "program",
      },
    });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    const panel = shadow?.querySelector<HTMLElement>("[data-panel='history']");

    expect(panel?.textContent).toContain("Cargando calificaciones");
    expect(panel?.querySelector("[data-history-program], [data-discover-programs]")).toBeNull();
    expect(panel?.querySelectorAll(".history-skeleton span")).toHaveLength(3);
    controller.dispose();
  });

  it("discovers programs through the delegated Web Dynpro controller", async () => {
    const discover = vi.fn().mockResolvedValue([{ index: 7, label: "Programa visible" }]);
    const controller = mountBetterSiriusShell(
      document,
      { ...readyModel, academicHistory: { state: "initial", courses: [] } },
      { onDiscoverHistoricalPrograms: discover },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    shadow?.querySelector<HTMLButtonElement>("[data-discover-programs]")?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(discover).toHaveBeenCalledOnce();
    expect(shadow?.querySelector("[data-history-program='7']")?.textContent).toContain("Programa visible");
    controller.dispose();
  });

  it("exposes withdrawn courses as a real filter beside the program choices", async () => {
    const action = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(
      document,
      {
        ...readyModel,
        academicHistory: {
          state: "initial",
          courses: [],
          programs: [{ index: 7, label: "Programa visible" }],
        },
      },
      { onSetHistoricalWithdrawn: action },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    const checkbox = shadow?.querySelector<HTMLInputElement>("[data-history-withdrawn]");
    checkbox?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(action).toHaveBeenCalledWith(true);
    expect(checkbox?.checked).toBe(true);
    expect(checkbox?.disabled).toBe(false);
    controller.dispose();
  });

  it("keeps program discovery retryable when no compatible popup appears", async () => {
    const discover = vi.fn().mockResolvedValue([]);
    const controller = mountBetterSiriusShell(
      document,
      { ...readyModel, academicHistory: { state: "initial", courses: [] } },
      { onDiscoverHistoricalPrograms: discover },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    const button = shadow?.querySelector<HTMLButtonElement>("[data-discover-programs]");
    button?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toContain("Intentar de nuevo");
    controller.dispose();
  });

  it("renders normalized academic-history results as a responsive read view", () => {
    const controller = mountBetterSiriusShell(document, readyModel);
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    const panel = shadow?.querySelector<HTMLElement>("[data-panel='history']");

    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain("SYN-204");
    expect(panel?.textContent).toContain("Materia sintética");
    expect(panel?.querySelector("[data-history-count]")?.textContent).toBe("01");
    expect(panel?.querySelector("form, input, select")).toBeNull();
    controller.dispose();
  });

  it("renders the academic period picker and delegates one explicit change", async () => {
    const action = vi.fn().mockResolvedValue("activated" as const);
    const controller = mountBetterSiriusShell(
      document,
      {
        ...readyModel,
        academicHistory: {
          ...readyModel.academicHistory,
          periods: [
            { index: 1, code: "SYN-NEW", academicYear: "2100", label: "Periodo reciente", active: true },
            { index: 2, code: "SYN-OLD", academicYear: "2099", label: "Periodo anterior", active: false },
          ],
        },
      },
      { onSelectHistoricalPeriod: action },
    );
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    const trigger = shadow?.querySelector<HTMLButtonElement>("[data-period-trigger]");
    const option = shadow?.querySelectorAll<HTMLButtonElement>("[data-history-period]")[1];
    if (!trigger || !option) throw new Error("Synthetic period picker was not rendered.");
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    option.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(action).toHaveBeenCalledWith({
      index: 2,
      code: "SYN-OLD",
      academicYear: "2099",
      label: "Periodo anterior",
      active: true,
    });
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(shadow?.querySelector("[data-period-status]")?.textContent).toContain("Cargando");
    controller.dispose();
  });

  it("keeps the period picker available for a valid empty period", () => {
    const controller = mountBetterSiriusShell(document, {
      ...readyModel,
      academicHistory: {
        state: "empty",
        courses: [],
        periods: [
          { index: 1, code: "SYN-EMPTY", academicYear: "2099", label: "Periodo vacío", active: true },
          { index: 2, code: "SYN-FULL", academicYear: "2098", label: "Periodo con materias", active: false },
        ],
      },
    });
    const shadow = document.getElementById(SHELL_HOST_ID)?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>("[data-view='history']")?.click();
    const panel = shadow?.querySelector<HTMLElement>("[data-panel='history']");

    expect(panel?.querySelector("[data-history-period]")).not.toBeNull();
    expect(panel?.querySelector("[data-history-count]")?.textContent).toBe("00");
    expect(panel?.textContent).toContain("No hay materias en este período");
    expect(panel?.querySelector("[data-open-history], [data-discover-programs]")).toBeNull();
    controller.dispose();
  });

  it("escapes academic values before rendering them", () => {
    const controller = mountBetterSiriusShell(document, {
      ...readyModel,
      academicHistory: {
        state: "results",
        courses: [{ code: "SYN-X", name: '<img src=x onerror="alert(1)">' }],
      },
    });
    const history = document.getElementById(SHELL_HOST_ID)?.shadowRoot?.querySelector("[data-history-view]");

    expect(history?.querySelector("img")).toBeNull();
    expect(history?.textContent).toContain('<img src=x onerror="alert(1)">');
    controller.dispose();
  });

  it("renders explicit failure states without retry controls", () => {
    const controller = mountBetterSiriusShell(document, {
      portalState: "sap-error",
      applications: [],
      academicProcesses: academicProcessCatalog(),
      academicHistory: { state: "unavailable", courses: [] },
      academicOffer: { state: "unavailable", offerings: [] },
    });
    const text = document.getElementById(SHELL_HOST_ID)?.shadowRoot?.textContent ?? "";

    expect(text).toContain("no hará reintentos automáticos");
    expect(text).not.toContain("Reintentar");
    controller.dispose();
  });
});
