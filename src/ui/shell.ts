import { SHELL_HOST_ID } from "../core/constants";
import { createResponsiveViewport } from "./responsive-viewport";
import type { ProgramSelection, ProgramSelectionResult } from "../academic/history";
import type { ReadOnlyNavigationResult } from "../navigation/academic-navigator";
import type { AcademicOfferSearchResult } from "../academic/offer";
import type {
  AcademicProcessGroup,
  AcademicProcessItem,
  AcademicProcessesModel,
  AcademicHistoryCourse,
  AcademicHistoryModel,
  AcademicHistoryPeriod,
  AcademicHistoryProgram,
  AcademicOfferLookupModel,
  AcademicOfferLookupOption,
  AcademicOfferModel,
  AcademicOffering,
  DetectedApplication,
  ShellModel,
  SupportedApplication,
} from "../core/types";

export interface ShellController {
  update(model: ShellModel): void;
  dispose(): void;
}

export interface ShellOptions {
  readonly onOpenHistoricalGrades?: () => Promise<ReadOnlyNavigationResult>;
  readonly onOpenPeriodGrades?: () => Promise<ReadOnlyNavigationResult>;
  readonly onOpenAcademicOffer?: () => Promise<ReadOnlyNavigationResult>;
  readonly onSearchAcademicOffer?: (code: string) => Promise<AcademicOfferSearchResult>;
  readonly onOpenAcademicOfferLookup?: () => Promise<AcademicOfferSearchResult>;
  readonly onSearchAcademicOfferLookup?: (query: string) => Promise<AcademicOfferSearchResult>;
  readonly onSelectAcademicOfferLookup?: (
    option: AcademicOfferLookupOption,
  ) => Promise<AcademicOfferSearchResult>;
  readonly onCloseAcademicOfferLookup?: () => Promise<AcademicOfferSearchResult>;
  readonly onDiscoverHistoricalPrograms?: () => Promise<readonly AcademicHistoryProgram[]>;
  readonly onSelectHistoricalProgram?: (selection: ProgramSelection) => Promise<ProgramSelectionResult>;
  readonly onSetHistoricalWithdrawn?: (enabled: boolean) => Promise<ProgramSelectionResult>;
  readonly onSelectHistoricalPeriod?: (selection: AcademicHistoryPeriod) => Promise<ProgramSelectionResult>;
}

type GradeInquiryKind = "historical" | "period";

const APPLICATION_LABELS: Readonly<Record<SupportedApplication, string>> = {
  "historical-grades": "Consulta Calificaciones Históricas",
  "academic-offer": "Oferta académica",
  registration: "Inscripción 2.0",
};

const ICONS = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v9.1h-6v-5.6h-5v5.6h-6z"/></svg>',
  views: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.2h16v5.1H4zm0 8.5h7v5.1H4zm10 0h6v5.1h-6z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 19 6v5.6c0 4.3-2.8 7.6-7 9-4.2-1.4-7-4.7-7-9V6z"/><path d="m8.8 12 2 2 4.5-4.5"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9"/><path d="M19 14v5H5V5h5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
} as const;

export function mountBetterSiriusShell(
  document: Document,
  initialModel: ShellModel,
  options: ShellOptions = {},
): ShellController {
  const existing = document.getElementById(SHELL_HOST_ID);
  existing?.remove();

  const host = document.createElement("div");
  host.id = SHELL_HOST_ID;
  host.dataset.mode = "enhanced";
  const shadow = host.attachShadow({ mode: "open" });
  const previousOverflow = document.body.style.overflow;
  const responsiveViewport = createResponsiveViewport(document);

  shadow.innerHTML = `${styles()}${markup()}`;
  document.documentElement.append(host);
  document.body.style.overflow = "hidden";

  const viewport = requiredElement<HTMLElement>(shadow, ".viewport");
  const returnButton = requiredElement<HTMLButtonElement>(shadow, ".return-button");
  const originalButtons = Array.from(shadow.querySelectorAll<HTMLButtonElement>("[data-show-original]"));
  const navigationButtons = Array.from(shadow.querySelectorAll<HTMLButtonElement>("[data-view]"));
  const navigationTargets = Array.from(
    shadow.querySelectorAll<HTMLButtonElement>(".navigation [data-route]"),
  );
  const panels = Array.from(shadow.querySelectorAll<HTMLElement>("[data-panel]"));
  let currentModel = initialModel;
  let gradeInquiry: GradeInquiryKind = "historical";

  const showOriginal = (): void => {
    responsiveViewport.deactivate();
    host.dataset.mode = "original";
    viewport.hidden = true;
    viewport.style.display = "none";
    returnButton.hidden = false;
    host.style.inset = "auto 18px 18px auto";
    host.style.width = "max-content";
    host.style.height = "max-content";
    document.body.style.overflow = previousOverflow;
  };

  const showEnhanced = (): void => {
    responsiveViewport.activate();
    host.dataset.mode = "enhanced";
    viewport.hidden = false;
    viewport.style.removeProperty("display");
    returnButton.hidden = true;
    host.style.removeProperty("inset");
    host.style.removeProperty("width");
    host.style.removeProperty("height");
    document.body.style.overflow = "hidden";
  };

  responsiveViewport.activate();

  const showPanel = (view: string, route = view, academicFocus?: string): void => {
    for (const button of navigationTargets) {
      const active = button.dataset.route === route
        || (button.dataset.route === "academic" && ["enrollment", "term", "requests"].includes(route));
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    }
    for (const panel of panels) panel.hidden = panel.dataset.panel !== view;
    if (academicFocus) {
      const target = shadow.querySelector<HTMLElement>(`[data-academic-group="${academicFocus}"]`);
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView?.({ block: "start" });
    }
  };

  for (const button of originalButtons) button.addEventListener("click", showOriginal);
  returnButton.addEventListener("click", showEnhanced);
  for (const button of navigationButtons) {
    button.addEventListener("click", () => {
      if (button.dataset.view === "history") {
        gradeInquiry = "historical";
        renderAcademicHistory(shadow, currentModel.academicHistory, gradeInquiry);
      }
      showPanel(
        button.dataset.view ?? "home",
        button.dataset.route ?? button.dataset.view ?? "home",
        button.dataset.academicFocus,
      );
    });
  }
  shadow.addEventListener("click", (event) => {
    const periodTrigger = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-period-trigger]")
      : null;
    if (periodTrigger) {
      togglePeriodMenu(periodTrigger);
      return;
    }
    const periodOption = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-history-period]")
      : null;
    if (periodOption) {
      const index = Number(periodOption.dataset.periodIndex);
      const code = periodOption.dataset.periodCode ?? "";
      const academicYear = periodOption.dataset.periodYear ?? "";
      const label = periodOption.dataset.periodLabel ?? "";
      if (Number.isInteger(index) && code && academicYear && label) {
        void selectHistoricalPeriod(
          periodOption,
          { index, code, academicYear, label, active: true },
          options.onSelectHistoricalPeriod,
        );
      }
      return;
    }
    closePeriodMenus(shadow);
    const discoverButton = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-discover-programs]")
      : null;
    if (discoverButton) {
      void discoverHistoricalPrograms(shadow, discoverButton, options.onDiscoverHistoricalPrograms);
      return;
    }
    const programButton = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-history-program]")
      : null;
    if (programButton) {
      const index = Number(programButton.dataset.historyProgram);
      const label = programButton.dataset.historyProgramLabel ?? "";
      if (Number.isInteger(index) && label) {
        void selectHistoricalProgram(programButton, { index, label }, options.onSelectHistoricalProgram);
      }
      return;
    }
    const lookupOption = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-offer-lookup-option]")
      : null;
    if (lookupOption) {
      const index = Number(lookupOption.dataset.offerLookupIndex);
      const code = lookupOption.dataset.offerLookupCode ?? "";
      const name = lookupOption.dataset.offerLookupName ?? "";
      if (Number.isInteger(index) && code && name) {
        void selectAcademicOfferLookup(
          lookupOption,
          { index, code, name },
          options.onSelectAcademicOfferLookup,
        );
      }
      return;
    }
    const lookupClose = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-close-offer-lookup]")
      : null;
    if (lookupClose) {
      void closeAcademicOfferLookup(lookupClose, options.onCloseAcademicOfferLookup);
      return;
    }
    const lookupOpen = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-open-offer-lookup]")
      : null;
    if (lookupOpen) {
      void openAcademicOfferLookup(lookupOpen, options.onOpenAcademicOfferLookup);
      return;
    }
    const offerTarget = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-open-academic-offer]")
      : null;
    if (offerTarget) {
      showPanel("offer", "enrollment");
      const canReuseCurrentApplication = currentModel.academicOffer.pending !== undefined
        || currentModel.academicOffer.state === "initial"
        || currentModel.academicOffer.state === "results"
        || currentModel.academicOffer.state === "empty";
      if (!canReuseCurrentApplication) {
        void openAcademicOffer(shadow, offerTarget, options.onOpenAcademicOffer);
      }
      return;
    }
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-open-history]")
      : null;
    const periodTarget = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-open-period-grades]")
      : null;
    const inquiryTarget = periodTarget ?? target;
    if (!inquiryTarget) return;
    gradeInquiry = periodTarget ? "period" : "historical";
    renderAcademicHistory(shadow, currentModel.academicHistory, gradeInquiry);
    showPanel("history", "requests");
    const context = rootActionContext(shadow, inquiryTarget);
    const action = gradeInquiry === "period"
      ? options.onOpenPeriodGrades
      : options.onOpenHistoricalGrades;
    const canReuseCurrentApplication = currentModel.academicHistory.pending !== undefined
      || currentModel.academicHistory.state === "initial"
      || currentModel.academicHistory.state === "results"
      || currentModel.academicHistory.state === "empty";
    if (context && canReuseCurrentApplication) context.status.hidden = true;
    else if (context) void openGradeInquiry(context, action, gradeInquiry);
  });
  shadow.addEventListener("submit", (event) => {
    const lookupForm = event.target instanceof HTMLFormElement
      && event.target.matches("[data-offer-lookup-form]")
      ? event.target
      : null;
    if (lookupForm) {
      event.preventDefault();
      const query = String(new FormData(lookupForm).get("lookup-query") ?? "");
      void searchAcademicOfferLookup(lookupForm, query, options.onSearchAcademicOfferLookup);
      return;
    }
    const form = event.target instanceof HTMLFormElement && event.target.matches("[data-offer-search-form]")
      ? event.target
      : null;
    if (!form) return;
    event.preventDefault();
    const code = String(new FormData(form).get("course-code") ?? "");
    void searchAcademicOffer(form, code, options.onSearchAcademicOffer);
  });
  shadow.addEventListener("change", (event) => {
    const withdrawn = event.target instanceof HTMLInputElement && event.target.matches("[data-history-withdrawn]")
      ? event.target
      : null;
    if (withdrawn) {
      void setHistoricalWithdrawn(withdrawn, options.onSetHistoricalWithdrawn);
    }
  });
  shadow.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    closePeriodMenus(shadow);
  });

  const update = (model: ShellModel): void => {
    currentModel = model;
    renderModel(shadow, model, gradeInquiry);
  };
  update(initialModel);

  return {
    update,
    dispose(): void {
      responsiveViewport.dispose();
      document.body.style.overflow = previousOverflow;
      host.remove();
    },
  };
}

async function setHistoricalWithdrawn(
  checkbox: HTMLInputElement,
  action: ShellOptions["onSetHistoricalWithdrawn"],
): Promise<void> {
  const status = checkbox.closest<HTMLElement>("[data-withdrawn-control]")
    ?.querySelector<HTMLElement>("[data-withdrawn-status]");
  checkbox.disabled = true;
  const result = action ? await action(checkbox.checked) : "not-found";
  checkbox.disabled = false;
  if (result === "activated") {
    if (status) status.hidden = true;
    return;
  }

  checkbox.checked = !checkbox.checked;
  if (status) {
    status.hidden = false;
    status.textContent = result === "stale"
      ? "El filtro cambió en Sirius. Inténtalo otra vez."
      : "Sirius no mostró el filtro de retiradas.";
  }
}

async function selectHistoricalPeriod(
  option: HTMLButtonElement,
  selection: AcademicHistoryPeriod,
  action: ShellOptions["onSelectHistoricalPeriod"],
): Promise<void> {
  const picker = option.closest<HTMLElement>("[data-period-picker]");
  const trigger = picker?.querySelector<HTMLButtonElement>("[data-period-trigger]");
  const menu = picker?.querySelector<HTMLElement>("[data-period-options]");
  const status = picker?.querySelector<HTMLElement>("[data-period-status]");
  if (trigger) {
    trigger.disabled = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  if (menu) menu.hidden = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Cargando período…";
  }

  const result = action ? await action(selection) : "not-found";
  if (result === "activated") {
    window.setTimeout(() => {
      if (!trigger?.isConnected || !trigger.disabled) return;
      trigger.disabled = false;
      if (status) status.textContent = "Sirius tardó demasiado. Puedes intentarlo otra vez.";
    }, 30_000);
    return;
  }

  if (trigger) trigger.disabled = false;
  if (status) status.textContent = result === "stale"
    ? "La lista de períodos cambió. Elige nuevamente."
    : "No se encontró ese período en Sirius.";
}

function togglePeriodMenu(trigger: HTMLButtonElement): void {
  const menu = trigger.closest<HTMLElement>("[data-period-picker]")
    ?.querySelector<HTMLElement>("[data-period-options]");
  if (!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  trigger.setAttribute("aria-expanded", String(open));
  if (open) menu.querySelector<HTMLButtonElement>("[aria-selected='true']")?.focus();
}

function closePeriodMenus(root: ShadowRoot): void {
  for (const menu of root.querySelectorAll<HTMLElement>("[data-period-options]")) menu.hidden = true;
  for (const trigger of root.querySelectorAll<HTMLElement>("[data-period-trigger]")) {
    trigger.setAttribute("aria-expanded", "false");
  }
}

async function discoverHistoricalPrograms(
  root: ShadowRoot,
  button: HTMLButtonElement,
  action: ShellOptions["onDiscoverHistoricalPrograms"],
): Promise<void> {
  button.disabled = true;
  button.textContent = "Leyendo programas…";
  const programs = action ? await action() : [];
  if (programs.length === 0) {
    button.disabled = false;
    button.textContent = "Intentar de nuevo";
    return;
  }
  requiredElement<HTMLElement>(root, "[data-history-view]").innerHTML = programChoicesMarkup(programs);
}

async function selectHistoricalProgram(
  button: HTMLButtonElement,
  selection: ProgramSelection,
  action: ShellOptions["onSelectHistoricalProgram"],
): Promise<void> {
  button.disabled = true;
  const result = action ? await action(selection) : "not-found";
  if (result === "activated") {
    button.textContent = "Cargando historial…";
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.disabled = false;
      button.textContent = "Intentar de nuevo";
    }, 30_000);
    return;
  }
  button.disabled = false;
  button.textContent = result === "stale"
    ? "La lista cambió; elige de nuevo"
    : "No se encontró el selector";
}

interface HistoryActionContext {
  readonly button: HTMLButtonElement;
  readonly status: HTMLElement;
}

function rootActionContext(root: ShadowRoot, button: HTMLButtonElement): HistoryActionContext | null {
  const status = root.querySelector<HTMLElement>("[data-history-action-status]");
  return status ? { button, status } : null;
}

async function openGradeInquiry(
  context: HistoryActionContext,
  action: ShellOptions["onOpenHistoricalGrades"] | ShellOptions["onOpenPeriodGrades"],
  inquiry: GradeInquiryKind,
): Promise<void> {
  context.button.disabled = true;
  context.status.hidden = false;
  context.status.textContent = inquiry === "period"
    ? "Abriendo calificaciones del período…"
    : "Abriendo historial…";
  const result = action ? await action() : "not-found";
  if (result === "activated") {
    context.status.textContent = "Esperando la respuesta de Sirius…";
    return;
  }

  const messages: Readonly<Record<Exclude<ReadOnlyNavigationResult, "activated">, string>> = {
    "not-found": "No encontré el acceso en la pantalla actual. Abre Procesos Académicos en Sirius original y vuelve a intentarlo.",
    ambiguous: "Sirius mostró más de un acceso posible. BetterSirius no seleccionará uno al azar.",
    busy: "Ya hay una navegación en curso.",
  };
  context.status.textContent = messages[result];
  context.button.disabled = false;
}

async function openAcademicOffer(
  root: ShadowRoot,
  button: HTMLButtonElement,
  action: ShellOptions["onOpenAcademicOffer"],
): Promise<void> {
  const status = root.querySelector<HTMLElement>("[data-offer-action-status]");
  button.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Abriendo Oferta Académica…";
  }
  const result = action ? await action() : "not-found";
  if (result === "activated") {
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    return;
  }

  const messages: Readonly<Record<Exclude<ReadOnlyNavigationResult, "activated">, string>> = {
    "not-found": "No encontré Oferta Académica en la navegación actual.",
    ambiguous: "Sirius mostró más de un acceso posible y la operación fue detenida.",
    busy: "Ya hay una navegación en curso.",
  };
  if (status) status.textContent = messages[result];
  button.disabled = false;
}

async function searchAcademicOffer(
  form: HTMLFormElement,
  code: string,
  action: ShellOptions["onSearchAcademicOffer"],
): Promise<void> {
  const input = form.querySelector<HTMLInputElement>("input[name='course-code']");
  const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
  const status = form.querySelector<HTMLElement>("[data-offer-search-status]");
  if (!input || !button || !status) return;

  const normalizedCode = code.trim().toLocaleUpperCase("es");
  if (!normalizedCode || normalizedCode.length > 12) {
    status.hidden = false;
    status.textContent = "Escribe un código de asignatura de hasta 12 caracteres.";
    input.focus();
    return;
  }

  input.disabled = true;
  button.disabled = true;
  status.hidden = false;
  status.textContent = `Buscando ${normalizedCode} en Sirius…`;
  const result = action ? await action(normalizedCode) : "not-found";
  if (result === "activated") return;
  if (!form.isConnected) return;

  const messages: Readonly<Record<Exclude<AcademicOfferSearchResult, "activated">, string>> = {
    invalid: "El código no es válido.",
    "not-found": "La pantalla de Oferta Académica cambió. Vuelve a abrirla e intenta nuevamente.",
    busy: "Ya hay una búsqueda en curso.",
  };
  input.disabled = false;
  button.disabled = false;
  status.textContent = messages[result];
}

async function openAcademicOfferLookup(
  button: HTMLButtonElement,
  action: ShellOptions["onOpenAcademicOfferLookup"],
): Promise<void> {
  const status = button.closest("form")?.querySelector<HTMLElement>("[data-offer-search-status]");
  button.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Abriendo el buscador de asignaturas…";
  }
  const result = action ? await action() : "not-found";
  if (result === "activated" || !button.isConnected) return;
  button.disabled = false;
  if (status) {
    status.textContent = result === "busy"
      ? "Ya hay una consulta en curso."
      : "Sirius no mostró el selector de asignaturas.";
  }
}

async function searchAcademicOfferLookup(
  form: HTMLFormElement,
  rawQuery: string,
  action: ShellOptions["onSearchAcademicOfferLookup"],
): Promise<void> {
  const input = form.querySelector<HTMLInputElement>("input[name='lookup-query']");
  const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
  const status = form.querySelector<HTMLElement>("[data-offer-lookup-status]");
  if (!input || !button || !status) return;
  const query = rawQuery.replace(/\s+/g, " ").trim();
  if (query.length < 2 || query.length > 20) {
    status.hidden = false;
    status.textContent = "Escribe entre 2 y 20 caracteres.";
    input.focus();
    return;
  }

  input.disabled = true;
  button.disabled = true;
  status.hidden = false;
  status.textContent = `Buscando “${query}” en Sirius…`;
  const result = action ? await action(query) : "not-found";
  if (result === "activated" || !form.isConnected) return;
  input.disabled = false;
  button.disabled = false;
  status.textContent = result === "busy"
    ? "Ya hay una consulta en curso."
    : result === "invalid"
      ? "El criterio no es válido."
      : "La ayuda de búsqueda de Sirius cambió o dejó de estar disponible.";
}

async function selectAcademicOfferLookup(
  button: HTMLButtonElement,
  option: AcademicOfferLookupOption,
  action: ShellOptions["onSelectAcademicOfferLookup"],
): Promise<void> {
  const status = button.closest("[data-offer-lookup]")
    ?.querySelector<HTMLElement>("[data-offer-lookup-status]");
  button.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = `Consultando las secciones de ${option.code}…`;
  }
  const result = action ? await action(option) : "not-found";
  if (result === "activated" || !button.isConnected) return;
  button.disabled = false;
  if (status) {
    status.textContent = result === "busy"
      ? "Ya hay una consulta en curso."
      : "No pude seleccionar esa asignatura de forma segura.";
  }
}

async function closeAcademicOfferLookup(
  button: HTMLButtonElement,
  action: ShellOptions["onCloseAcademicOfferLookup"],
): Promise<void> {
  button.disabled = true;
  const result = action ? await action() : "not-found";
  if (result !== "activated" && button.isConnected) button.disabled = false;
}

function renderModel(root: ShadowRoot, model: ShellModel, inquiry: GradeInquiryKind): void {
  const status = portalStatus(model.portalState);
  requiredElement(root, "[data-status-title]").textContent = status.title;
  requiredElement(root, "[data-status-copy]").textContent = status.copy;
  const statusBanner = requiredElement<HTMLElement>(root, "[data-status-banner]");
  statusBanner.className = `status-banner ${status.tone}`;
  statusBanner.hidden = model.portalState === "portal-shell";

  const appLists = Array.from(root.querySelectorAll<HTMLElement>("[data-application-list]"));
  for (const appList of appLists) {
    if (model.applications.length === 0) {
      appList.innerHTML = `
      <div class="empty-state">
        <span class="empty-rule"></span>
        <h3>No hay una vista compatible abierta</h3>
        <p>BetterSirius no hará solicitudes para buscar contenido. Abre una sección desde Sirius original y la detectaremos aquí.</p>
        <button class="text-action" type="button" data-show-original-inline>Ver interfaz original ${ICONS.arrow}</button>
      </div>`;
      requiredElement<HTMLButtonElement>(appList, "[data-show-original-inline]").addEventListener(
        "click",
        () => requiredElement<HTMLButtonElement>(root, "[data-show-original]").click(),
      );
    } else {
      appList.innerHTML = model.applications.map(applicationMarkup).join("");
    }
  }

  const count = root.querySelector<HTMLElement>("[data-detected-count]");
  if (count) count.textContent = String(model.applications.length).padStart(2, "0");

  renderAcademicProcesses(root, model.academicProcesses);
  renderAcademicHistory(root, model.academicHistory, inquiry);
  renderAcademicOffer(root, model.academicOffer);
}

function renderAcademicHistory(
  root: ShadowRoot,
  model: AcademicHistoryModel,
  inquiry: GradeInquiryKind,
): void {
  const inquiryTitle = inquiry === "period"
    ? "Consulta de Calificaciones Período"
    : "Consulta Calificaciones Históricas";
  requiredElement<HTMLElement>(root, "[data-history-title]").textContent = inquiryTitle;
  for (const counter of root.querySelectorAll<HTMLElement>("[data-history-count]")) {
    counter.textContent = model.state === "results" || model.state === "empty"
      ? String(model.courses.length).padStart(2, "0")
      : "—";
  }

  const container = requiredElement<HTMLElement>(root, "[data-history-view]");
  if (model.pending) {
    container.innerHTML = historyLoadingMarkup(model.pending, inquiry);
    return;
  }

  if (model.state === "results") {
    container.innerHTML = `
      ${historyPeriodPickerMarkup(model.periods ?? [])}
      <div class="history-table-wrap">
        <table class="history-table">
          <thead><tr><th>Materia</th><th>Período</th><th>Nota</th><th>Créditos</th><th>Puntos</th><th>Comentarios</th></tr></thead>
          <tbody>${model.courses.map(historyCourseMarkup).join("")}</tbody>
        </table>
      </div>`;
    return;
  }

  if (model.state === "empty") {
    container.innerHTML = `
      ${historyPeriodPickerMarkup(model.periods ?? [])}
      <div class="history-empty period-empty">
        <span class="empty-rule"></span>
        <h2>No hay materias en este período</h2>
        <p>Sirius no mostró calificaciones para el período seleccionado.</p>
      </div>`;
    return;
  }


  if (model.state === "initial" && model.programs?.length) {
    container.innerHTML = programChoicesMarkup(model.programs);
    return;
  }

  if (model.state === "initial") {
    container.innerHTML = `
      <div class="history-empty">
        <span class="empty-rule"></span>
        <h2>Selecciona un programa académico</h2>
        <button class="primary-action" type="button" data-discover-programs>
          Mostrar programas ${ICONS.arrow}
        </button>
      </div>`;
    return;
  }

  const states: Readonly<Record<AcademicHistoryModel["state"], readonly [string, string]>> = {
    unavailable: ["El historial no está abierto", "Ábrelo directamente desde BetterSirius."],
    initial: ["Selecciona tu programa", ""],
    empty: ["No hay materias en este período", "Sirius no mostró calificaciones para el período seleccionado."],
    unknown: ["La pantalla no es reconocible", "La aplicación parece ser el historial, pero su estructura no coincide con los fixtures seguros. Usa Sirius original."],
    results: ["", ""],
  };
  const [emptyTitle, copy] = states[model.state];
  const actionAttribute = inquiry === "period" ? "data-open-period-grades" : "data-open-history";
  const actionLabel = inquiry === "period" ? "Abrir consulta del período" : "Abrir historial";
  container.innerHTML = `<div class="history-empty"><span class="empty-rule"></span><h2>${emptyTitle}</h2><p>${copy}</p><button class="primary-action" type="button" ${actionAttribute}>${actionLabel} ${ICONS.arrow}</button></div>`;
}

function historyLoadingMarkup(
  pending: NonNullable<AcademicHistoryModel["pending"]>,
  inquiry: GradeInquiryKind,
): string {
  const titles = {
    opening: inquiry === "period"
      ? "Abriendo Consulta de Calificaciones Período"
      : "Abriendo Consulta Calificaciones Históricas",
    program: "Cargando calificaciones",
    period: "Cambiando período académico",
  } as const;
  return `
    <div class="history-loading" role="status" aria-live="polite">
      <div class="loading-copy">
        <span class="loading-rule"></span>
        <h2>${titles[pending]}</h2>
        <p>Sirius está procesando la selección.</p>
      </div>
      <div class="history-skeleton" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </div>`;
}

function historyPeriodPickerMarkup(periods: readonly AcademicHistoryPeriod[]): string {
  if (periods.length === 0) return "";
  const activePeriod = periods.find((period) => period.active) ?? periods[0]!;
  return `
    <section class="period-picker" data-period-picker aria-label="Período académico">
      <span class="period-label" id="better-sirius-period-label">Período académico</span>
      <div class="period-select-wrap">
        <button class="period-trigger" id="better-sirius-period" type="button"
          data-period-trigger aria-labelledby="better-sirius-period-label better-sirius-period-value"
          aria-haspopup="listbox" aria-expanded="false">
          <span id="better-sirius-period-value">${escapeHtml(activePeriod.label)} · ${escapeHtml(activePeriod.academicYear)}</span>
          <span class="period-select-arrow" aria-hidden="true">${ICONS.arrow}</span>
        </button>
        <div class="period-options" data-period-options role="listbox"
          aria-labelledby="better-sirius-period-label" hidden>
          ${periods.map((period) => `
            <button class="period-option" type="button" role="option"
              data-history-period data-period-index="${period.index}"
              data-period-code="${escapeHtml(period.code)}"
              data-period-year="${escapeHtml(period.academicYear)}"
              data-period-label="${escapeHtml(period.label)}"
              aria-selected="${period.index === activePeriod.index}">
              <span>${escapeHtml(period.label)} · ${escapeHtml(period.academicYear)}</span>
              ${period.index === activePeriod.index ? ICONS.check : ""}
            </button>`).join("")}
        </div>
      </div>
      <p class="period-status" data-period-status role="status" hidden></p>
    </section>`;
}

function programChoicesMarkup(programs: readonly AcademicHistoryProgram[]): string {
  return `
    <div class="history-empty">
      <span class="empty-rule"></span>
      <h2>Selecciona un programa académico</h2>
      <div class="withdrawn-control" data-withdrawn-control>
        <label>
          <input type="checkbox" data-history-withdrawn>
          <span>Incluir materias retiradas</span>
        </label>
        <p data-withdrawn-status role="status" hidden></p>
      </div>
      <div class="program-list">
        ${programs.map((program) => `
          <button class="program-action" type="button"
            data-history-program="${program.index}"
            data-history-program-label="${escapeHtml(program.label)}">
            <span>${escapeHtml(program.label)}</span>${ICONS.arrow}
          </button>`).join("")}
      </div>
    </div>`;
}

function historyCourseMarkup(course: AcademicHistoryCourse): string {
  return `<tr>
    <td data-label="Materia"><strong>${escapeHtml(course.code)}</strong><span>${escapeHtml(course.name)}</span></td>
    <td data-label="Período">${escapeHtml(course.period ?? "—")}</td>
    <td data-label="Nota"><b class="history-grade">${escapeHtml(course.grade ?? "—")}</b></td>
    <td data-label="Créditos">${escapeHtml(course.approvedCredits ?? "—")}${course.attemptedCredits ? `<small> / ${escapeHtml(course.attemptedCredits)} cursados</small>` : ""}</td>
    <td data-label="Puntos">${escapeHtml(course.points ?? "—")}</td>
    <td data-label="Comentarios">${escapeHtml(course.comments ?? "—")}</td>
  </tr>`;
}

function renderAcademicOffer(root: ShadowRoot, model: AcademicOfferModel): void {
  for (const counter of root.querySelectorAll<HTMLElement>("[data-offer-count]")) {
    counter.textContent = model.state === "results" || model.state === "empty"
      ? String(model.offerings.length).padStart(2, "0")
      : "—";
  }
  const container = requiredElement<HTMLElement>(root, "[data-offer-view]");
  if (model.pending === "opening") {
    container.innerHTML = offerLoadingMarkup(model.pending, model.query);
    return;
  }

  const search = offerSearchMarkup(model.query, model.lookup);
  const lookup = offerLookupMarkup(model.lookup);
  if (model.pending === "searching") {
    container.innerHTML = `${search}${offerLoadingMarkup(model.pending, model.query, true)}${lookup}`;
    return;
  }

  if (model.state === "results") {
    container.innerHTML = `
      ${search}
      <div class="offer-result-heading">
        <div><span class="eyebrow">Resultado</span><h2>${escapeHtml(model.offerings[0]?.name ?? "Oferta encontrada")}</h2></div>
        <span><strong>${model.offerings.length}</strong> ${model.offerings.length === 1 ? "sección" : "secciones"}</span>
      </div>
      <div class="offer-list">${model.offerings.map(academicOfferingMarkup).join("")}</div>
      ${lookup}`;
    return;
  }

  if (model.state === "empty") {
    container.innerHTML = `
      ${search}
      <div class="offer-empty">
        <span class="empty-rule"></span>
        <h2>No hay oferta para ese código</h2>
        <p>Sirius respondió sin secciones disponibles. Prueba con otro código.</p>
      </div>
      ${lookup}`;
    return;
  }

  if (model.state === "initial") {
    container.innerHTML = `
      ${search}
      ${model.lookup ? "" : `
        <div class="offer-empty compact">
          <span class="empty-rule"></span>
          <h2>Busca una asignatura</h2>
          <p>Usa el código exacto o abre el buscador para encontrarla por nombre o prefijo.</p>
        </div>`}
      ${lookup}`;
    return;
  }

  const unknown = model.state === "unknown";
  container.innerHTML = `
    <div class="offer-empty">
      <span class="empty-rule"></span>
      <h2>${unknown ? "No pude interpretar la respuesta" : "Oferta Académica no está abierta"}</h2>
      <p>${unknown
        ? "La estructura de Sirius no coincide con el formato verificado."
        : "Abre la consulta directamente desde BetterSirius."}</p>
      <button class="primary-action" type="button" data-open-academic-offer>
        ${unknown ? "Volver a abrir" : "Abrir Oferta Académica"} ${ICONS.arrow}
      </button>
    </div>`;
}

function offerSearchMarkup(query = "", lookup?: AcademicOfferLookupModel): string {
  return `
    <form class="offer-search" data-offer-search-form novalidate>
      <label for="better-sirius-offer-code">Código de asignatura</label>
      <div class="offer-search-row">
        <input id="better-sirius-offer-code" name="course-code" type="text" maxlength="12"
          value="${escapeHtml(query)}" autocomplete="off" autocapitalize="characters" spellcheck="false"
          placeholder="Ej. FBMT002">
        <button class="primary-action" type="submit">Buscar ${ICONS.arrow}</button>
      </div>
      <div class="offer-search-alternative">
        <span>¿No conoces el código exacto?</span>
        <button type="button" data-open-offer-lookup ${lookup ? "disabled" : ""}>
          ${lookup ? "Buscador abierto" : "Buscar por nombre o prefijo"} ${ICONS.arrow}
        </button>
      </div>
      <p data-offer-search-status role="status" hidden></p>
    </form>`;
}

function offerLookupMarkup(lookup?: AcademicOfferLookupModel): string {
  if (!lookup) return "";
  const query = lookup.query ?? "";
  const body = lookup.pending === "opening"
    ? `<div class="offer-lookup-loading" role="status"><span></span><span></span><span></span></div>`
    : lookup.pending === "searching"
      ? `<div class="offer-lookup-loading" role="status" aria-label="Buscando asignaturas"><span></span><span></span><span></span></div>`
      : lookup.state === "results"
        ? `<div class="offer-lookup-results">
            <div class="offer-lookup-summary"><strong>${lookup.options.length}</strong><span>${lookup.options.length === 1 ? "asignatura" : "asignaturas"}</span></div>
            <div class="offer-lookup-list">${lookup.options.map(academicOfferLookupOptionMarkup).join("")}</div>
          </div>`
        : lookup.state === "empty"
          ? `<div class="offer-lookup-empty"><strong>Sin coincidencias</strong><p>Prueba con parte del nombre o con un prefijo como FGE.</p></div>`
          : lookup.state === "unknown"
            ? `<div class="offer-lookup-empty"><strong>No pude leer el selector</strong><p>Cierra esta búsqueda y vuelve a abrirla.</p></div>`
            : `<div class="offer-lookup-empty"><strong>Busca por nombre o prefijo</strong><p>Ejemplos: Psicología positiva, Matemática o FGE.</p></div>`;
  return `
    <section class="offer-lookup" data-offer-lookup>
      <header>
        <div><span class="eyebrow">Selector de asignaturas</span><h2>Buscar por nombre o código</h2></div>
        <button type="button" data-close-offer-lookup aria-label="Cerrar selector">Cerrar</button>
      </header>
      <form data-offer-lookup-form novalidate>
        <label for="better-sirius-offer-lookup">Nombre, código o prefijo</label>
        <div class="offer-lookup-search-row">
          <input id="better-sirius-offer-lookup" name="lookup-query" type="search" minlength="2" maxlength="20"
            value="${escapeHtml(query)}" autocomplete="off" spellcheck="false"
            placeholder="Ej. Psicología positiva o FGE">
          <button class="primary-action" type="submit">Buscar ${ICONS.arrow}</button>
        </div>
        <p data-offer-lookup-status role="status" hidden></p>
      </form>
      ${body}
    </section>`;
}

function academicOfferLookupOptionMarkup(option: AcademicOfferLookupOption): string {
  return `
    <article class="offer-lookup-option">
      <div><span>${escapeHtml(option.code)}</span><h3>${escapeHtml(option.name)}</h3></div>
      <button type="button" data-offer-lookup-option
        data-offer-lookup-index="${option.index}"
        data-offer-lookup-code="${escapeHtml(option.code)}"
        data-offer-lookup-name="${escapeHtml(option.name)}">
        Ver secciones ${ICONS.arrow}
      </button>
    </article>`;
}

function offerLoadingMarkup(
  pending: NonNullable<AcademicOfferModel["pending"]>,
  query?: string,
  inline = false,
): string {
  const title = pending === "opening"
    ? "Abriendo Oferta Académica"
    : `Buscando ${escapeHtml(query ?? "la asignatura")}`;
  return `
    <div class="offer-loading${inline ? " inline" : ""}" role="status" aria-live="polite">
      <div><span class="loading-rule"></span><h2>${title}</h2><p>Esperando la respuesta de Sirius.</p></div>
      <div class="offer-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>`;
}

function academicOfferingMarkup(offering: AcademicOffering): string {
  const sectionIdentity = offering.block || offering.blockDescription || "";
  const blockLabel = academicSectionLabel(sectionIdentity, offering.blockDescription);
  const schedules = offering.schedules?.length
    ? offering.schedules
    : offering.schedule
      ? [offering.schedule]
      : [];
  return `
    <article class="offer-row">
      <header>
        <div><span class="offer-code">${escapeHtml(offering.code)}</span><h3>${escapeHtml(blockLabel)}</h3></div>
        <div class="offer-tags">
          ${sectionIdentity ? `<span class="offer-section-code">${escapeHtml(sectionIdentity)}</span>` : ""}
          ${offering.modality ? `<span class="offer-modality">${escapeHtml(offering.modality)}</span>` : ""}
        </div>
      </header>
      <div class="offer-primary-data">
        <div class="offer-schedule-data"><span>Horario</span>${academicSchedulesMarkup(schedules)}</div>
        <div><span>Cupo</span><strong>${escapeHtml(offering.capacity ?? "—")}</strong></div>
        <div><span>Período</span><strong>${escapeHtml(offering.period ?? "—")}</strong></div>
        <div><span>Créditos</span><strong>${escapeHtml(offering.credits ?? "—")}</strong></div>
      </div>
      <details class="offer-details">
        <summary>Prerrequisitos y costo ${ICONS.arrow}</summary>
        <dl>
          <div><dt>Prerrequisito</dt><dd>${escapeHtml(offering.prerequisite ?? "Ninguno indicado")}</dd></div>
          <div><dt>Código</dt><dd>${escapeHtml(offering.prerequisiteCode ?? "—")}</dd></div>
          <div><dt>Costo primer mes</dt><dd>${escapeHtml(offering.firstMonthCost ?? "—")}</dd></div>
        </dl>
      </details>
    </article>`;
}

function academicSectionLabel(identity: string, description?: string): string {
  const suffix = identity.match(/-(\d+)$/)?.[1] ?? identity.match(/^0*(\d+)$/)?.[1];
  if (suffix) return `Sección ${Number(suffix)}`;
  return description || identity || "Sección";
}

function academicSchedulesMarkup(schedules: readonly string[]): string {
  if (schedules.length === 0) return "<strong>Por definir</strong>";
  return `<ul class="offer-meetings">${schedules.map((schedule) => {
    const meeting = splitAcademicSchedule(schedule);
    return `<li><span>${escapeHtml(meeting.day)}</span><strong>${escapeHtml(meeting.time)}</strong></li>`;
  }).join("")}</ul>`;
}

function splitAcademicSchedule(schedule: string): { readonly day: string; readonly time: string } {
  const match = schedule.trim().match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,3})(?:\s*[-–]\s*|\s+)(\d{1,2}:\d{2}.*)$/);
  if (!match) return { day: "Horario", time: schedule };
  const key = match[1]!.toLocaleLowerCase("es");
  const days: Readonly<Record<string, string>> = {
    lu: "Lunes",
    ma: "Martes",
    mi: "Miércoles",
    ju: "Jueves",
    vi: "Viernes",
    sa: "Sábado",
    sá: "Sábado",
    do: "Domingo",
  };
  return { day: days[key] ?? match[1]!, time: match[2]! };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

function renderAcademicProcesses(root: ShadowRoot, model: AcademicProcessesModel): void {
  for (const counter of root.querySelectorAll<HTMLElement>("[data-academic-total]")) {
    counter.textContent = String(model.totalCount).padStart(2, "0");
  }
  for (const counter of root.querySelectorAll<HTMLElement>("[data-academic-detected]")) {
    counter.textContent = String(model.detectedCount).padStart(2, "0");
  }

  const overview = root.querySelector<HTMLElement>("[data-academic-overview]");
  if (overview) overview.innerHTML = model.groups.map(academicOverviewMarkup).join("");
  const groups = root.querySelector<HTMLElement>("[data-academic-groups]");
  if (groups) groups.innerHTML = model.groups.map(academicGroupMarkup).join("");
}

function academicOverviewMarkup(group: AcademicProcessGroup): string {
  const readOnlyCount = group.processes.filter((process) => process.mode !== "blocked").length;
  return `
    <article class="overview-group">
      <span class="overview-number">${String(group.processes.length).padStart(2, "0")}</span>
      <div><h3>${group.label}</h3><p>${group.description}</p></div>
      <span class="overview-safe">${readOnlyCount} de consulta</span>
    </article>`;
}

function academicGroupMarkup(group: AcademicProcessGroup): string {
  if (group.processes.length === 0) {
    return `
      <section class="process-destination" data-academic-group="${group.id}">
        <h2>${escapeHtml(group.label)}</h2>
      </section>`;
  }
  return `
    <details class="process-group" data-academic-group="${group.id}">
      <summary>
        <span><small>${String(group.processes.length).padStart(2, "0")}</small><strong>${escapeHtml(group.label)}</strong></span>
        ${ICONS.arrow}
      </summary>
      <div class="process-list">${group.processes.map(academicProcessMarkup).join("")}</div>
    </details>`;
}

function academicProcessMarkup(process: AcademicProcessItem): string {
  const isHistory = process.id === "historical-grades";
  const isPeriodGrades = process.id === "period-grades";
  const isAcademicOffer = process.id === "academic-offer";
  const isAction = isHistory || isPeriodGrades || isAcademicOffer;
  const element = isAction ? "button" : "article";
  const attributes = isHistory
    ? 'type="button" data-open-history'
    : isPeriodGrades
      ? 'type="button" data-open-period-grades'
      : isAcademicOffer
        ? 'type="button" data-open-academic-offer'
        : 'aria-disabled="true"';
  return `
    <${element} class="process-row ${isAction ? "process-row-action" : ""}" ${attributes}>
      <h3>${escapeHtml(process.label)}</h3>
      ${isAction ? ICONS.arrow : ""}
    </${element}>`;
}

function applicationMarkup(application: DetectedApplication): string {
  const isBlocked = application.application === "registration";
  const detail = isBlocked
    ? "Detectada, pero todas las acciones están bloqueadas en este MVP."
    : application.state === "unknown"
      ? "La aplicación fue reconocida; su estado aún no es compatible."
      : `Estado reconocido: ${stateLabel(application.state)}.`;
  return `
    <article class="application-row">
      <span class="application-index">${application.application === "historical-grades" ? "01" : application.application === "academic-offer" ? "02" : "03"}</span>
      <div>
        <h3>${APPLICATION_LABELS[application.application]}</h3>
        <p>${detail}</p>
      </div>
      <span class="state-label ${isBlocked ? "blocked" : ""}">${isBlocked ? "Solo detección" : "Vista local"}</span>
    </article>`;
}

function stateLabel(state: DetectedApplication["state"]): string {
  const labels = {
    initial: "inicio",
    results: "resultados",
    empty: "sin resultados",
    error: "error",
    unknown: "desconocido",
  } as const;
  return labels[state];
}

function portalStatus(state: ShellModel["portalState"]): {
  title: string;
  copy: string;
  tone: string;
} {
  if (state === "session-expired") {
    return {
      title: "La sesión de Sirius ya no está disponible",
      copy: "No reintentamos ni reconstruimos la sesión. Vuelve a la interfaz original para iniciar sesión de forma segura.",
      tone: "warning",
    };
  }
  if (state === "sap-error") {
    return {
      title: "Sirius devolvió un error",
      copy: "BetterSirius detuvo la lectura y no hará reintentos automáticos. La interfaz original sigue intacta.",
      tone: "warning",
    };
  }
  return {
    title: "Sirius está conectado",
    copy: "Esta capa organiza lo que ya está abierto. SAP sigue siendo la fuente oficial y no se envían solicitudes adicionales.",
    tone: "ready",
  };
}

function markup(): string {
  return `
    <div class="viewport">
      <aside class="sidebar" aria-label="Navegación de BetterSirius">
        <div class="brand"><span class="brand-mark">B</span><span>BetterSirius</span></div>
        <nav class="navigation">
          <button class="nav-item is-active" type="button" data-view="home" data-route="home" aria-current="page">${ICONS.home}<span>Inicio</span></button>
          <div class="nav-section">
            <button class="nav-item" type="button" data-view="academic" data-route="academic">${ICONS.views}<span class="nav-label-wide">Procesos Académicos</span><span class="nav-label-mobile">Académico</span></button>
            <div class="nav-tree" aria-label="Pregrado">
              <span>Pregrado</span>
              <button type="button" data-view="academic" data-route="enrollment" data-academic-focus="enrollment">Matrícula Pregrado</button>
              <button type="button" data-view="academic" data-route="term" data-academic-focus="term">Trimestre Pregrado</button>
              <button type="button" data-view="academic" data-route="requests" data-academic-focus="requests">Consultas y Solicitudes</button>
            </div>
          </div>
        </nav>
      </aside>

      <main class="content">
        <header class="topbar">
          <div><span class="read-only-badge"><i></i> Solo lectura</span></div>
          <button class="original-button" type="button" data-show-original>${ICONS.external}<span>Ver Sirius original</span></button>
        </header>

        <section class="panel" data-panel="home">
          <div class="hero-copy compact-hero">
            <span class="eyebrow">Pregrado</span>
            <h1>Procesos Académicos</h1>
          </div>

          <div class="status-banner ready" data-status-banner role="status">
            <span class="status-indicator"></span>
            <div><strong data-status-title></strong><p data-status-copy></p></div>
          </div>

          <div class="home-actions">
            <button type="button" data-view="academic" data-route="academic"><span>Ver Procesos Académicos</span><strong><span data-academic-total>00</span> opciones</strong>${ICONS.arrow}</button>
            <button type="button" data-view="history" data-route="requests"><span>Consulta Calificaciones Históricas</span><strong><span data-history-count>—</span> materias</strong>${ICONS.arrow}</button>
          </div>
        </section>

        <section class="panel" data-panel="history" hidden>
          <div class="breadcrumb">Procesos Académicos <span>/</span> Pregrado <span>/</span> Consultas y Solicitudes</div>
          <div class="page-heading history-heading"><h1 data-history-title>Consulta Calificaciones Históricas</h1><div class="page-count"><strong data-history-count>—</strong><span>materias</span></div></div>
          <p class="action-status" data-history-action-status role="status" hidden></p>
          <div data-history-view></div>
        </section>

        <section class="panel" data-panel="offer" hidden>
          <div class="breadcrumb">Procesos Académicos <span>/</span> Pregrado <span>/</span> Matrícula Pregrado</div>
          <div class="page-heading offer-heading">
            <div><span class="eyebrow">Consulta</span><h1>Oferta Académica</h1></div>
            <div class="page-count"><strong data-offer-count>—</strong><span>secciones</span></div>
          </div>
          <p class="action-status" data-offer-action-status role="status" hidden></p>
          <div data-offer-view></div>
        </section>

        <section class="panel" data-panel="academic" hidden>
          <div class="page-heading academic-heading">
            <div><span class="eyebrow">Pregrado</span><h1>Procesos Académicos</h1></div>
          </div>
          <div class="process-groups" data-academic-groups></div>
        </section>
      </main>
    </div>
    <button class="return-button" type="button" hidden>${ICONS.home}<span>Volver a BetterSirius</span></button>`;
}

function styles(): string {
  return `<style>
    :host { --ink: #173461; --muted: #5f6b7a; --line: #dce3ec; --paper: #f7f9fc; --surface: #ffffff; --accent: #f68629; --accent-strong: #d85a00; --accent-soft: #fff0e2; --blue: #003087; --blue-bright: #1859a9; --blue-soft: #eaf1fb; position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; color: var(--ink); font-family: "Roboto", "Segoe UI Variable", "Segoe UI", ui-sans-serif, sans-serif; }
    :host([data-mode="original"]) { inset: auto 18px 18px auto; inline-size: max-content; block-size: max-content; overflow: visible; }
    * { box-sizing: border-box; }
    button { font: inherit; }
    button:focus-visible { outline: 3px solid rgba(0,48,135,.32); outline-offset: 3px; }
    svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .viewport { display: grid; grid-template-columns: 224px minmax(0, 1fr); width: 100%; max-width: 100vw; height: 100dvh; min-height: 100dvh; background: var(--paper); overflow: hidden; }
    .viewport[hidden] { display: none !important; }
    .sidebar { display: flex; flex-direction: column; min-height: 100dvh; padding: 28px 18px 22px; color: #ffffff; background: var(--blue); }
    .brand { display: flex; align-items: center; gap: 11px; padding: 0 8px; font-weight: 680; letter-spacing: -.02em; }
    .brand-mark { display: grid; place-items: center; width: 31px; height: 31px; border: 1px solid rgba(255,255,255,.18); border-radius: 9px; color: var(--blue); background: var(--accent); font-weight: 800; }
    .navigation { display: grid; gap: 5px; margin-top: 58px; }
    .nav-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; border: 0; border-radius: 9px; color: rgba(255,255,255,.72); background: transparent; cursor: pointer; text-align: left; transition: background-color .2s ease, color .2s ease, transform .2s ease; }
    .nav-item:hover { color: #ffffff; background: rgba(255,255,255,.09); }
    .nav-item.is-active { color: var(--blue); background: #ffffff; box-shadow: inset 3px 0 0 var(--accent); }
    .nav-section { display: grid; gap: 4px; }
    .nav-tree { display: grid; gap: 2px; margin: 4px 0 0 43px; padding-left: 12px; border-left: 1px solid rgba(255,255,255,.2); }
    .nav-tree > span { padding: 7px 8px 5px; color: rgba(255,255,255,.48); font-size: 9px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
    .nav-tree button { padding: 7px 8px; border: 0; border-radius: 6px; color: rgba(255,255,255,.68); background: transparent; font-size: 11px; line-height: 1.25; text-align: left; cursor: pointer; }
    .nav-tree button:hover { color: #fff; background: rgba(255,255,255,.08); }
    .nav-tree button.is-active { color: #fff; background: rgba(255,255,255,.14); }
    .nav-label-mobile { display: none; }
    .nav-item:active, .original-button:active, .text-action:active, .return-button:active { transform: translateY(1px); }
    .content { min-width: 0; width: 100%; height: 100dvh; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .topbar { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; min-height: 72px; padding: 14px clamp(22px, 4vw, 62px); border-top: 4px solid var(--accent); border-bottom: 1px solid rgba(220,227,236,.94); background: rgba(247,249,252,.95); backdrop-filter: blur(12px); z-index: 2; }
    .topbar > div { display: flex; align-items: center; gap: 13px; }
    .context-label { color: var(--muted); font-size: 13px; }
    .read-only-badge { display: inline-flex; align-items: center; gap: 7px; padding: 5px 9px; border: 1px solid #f4bf91; border-radius: 999px; color: #9d4808; background: var(--accent-soft); font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
    .read-only-badge i { width: 6px; height: 6px; border-radius: 50%; background: var(--blue); }
    .original-button, .return-button { display: inline-flex; align-items: center; gap: 9px; padding: 9px 13px; border: 1px solid #e97620; border-radius: 9px; color: var(--blue); background: var(--accent); font-weight: 690; font-size: 13px; cursor: pointer; box-shadow: 0 5px 16px rgba(128,57,8,.09); transition: border-color .2s ease, transform .2s ease; }
    .original-button:hover { border-color: var(--blue); }
    .panel { min-width: 0; width: min(1180px, 100%); margin: 0 auto; padding: clamp(42px, 7vw, 90px) clamp(22px, 5vw, 72px) 80px; animation: enter .38s cubic-bezier(.16,1,.3,1); }
    .panel[hidden] { display: none; }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(190px, .55fr); gap: clamp(34px, 8vw, 110px); align-items: end; }
    .eyebrow { display: block; color: var(--blue); font-size: 11px; font-weight: 780; letter-spacing: .13em; text-transform: uppercase; }
    h1, h2, h3, p { margin-top: 0; }
    .hero-copy h1, .page-heading h1 { max-width: 760px; margin: 17px 0 20px; font-size: clamp(37px, 5vw, 66px); line-height: .98; letter-spacing: -.055em; font-weight: 690; }
    .hero-copy p, .page-heading p { max-width: 650px; margin-bottom: 0; color: var(--muted); font-size: 16px; line-height: 1.7; }
    .metric-block { padding: 10px 0 4px 25px; border-left: 3px solid var(--accent); }
    .metric-block span { display: block; font-variant-numeric: tabular-nums; font-size: clamp(48px, 6vw, 78px); line-height: .9; letter-spacing: -.06em; }
    .metric-block p { max-width: 145px; margin: 13px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .status-banner { display: grid; grid-template-columns: auto 1fr; gap: 13px; margin-top: 54px; padding: 18px 20px; border: 1px solid #f2c69f; border-radius: 12px; background: var(--accent-soft); }
    .status-banner[hidden] { display: none; }
    .status-banner.warning { border-color: #bfd0e7; background: var(--blue-soft); }
    .status-indicator { width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 5px rgba(0,48,135,.09); }
    .warning .status-indicator { background: var(--blue-bright); box-shadow: 0 0 0 5px rgba(24,89,169,.1); }
    .status-banner strong { font-size: 14px; }
    .status-banner p { margin: 4px 0 0; color: #4f6580; font-size: 13px; line-height: 1.5; }
    .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-top: 62px; padding-bottom: 19px; border-bottom: 1px solid var(--line); }
    .section-heading h2 { margin: 7px 0 0; font-size: 25px; letter-spacing: -.035em; }
    .quiet-link, .text-action { display: inline-flex; align-items: center; gap: 7px; padding: 6px 0; border: 0; color: var(--blue); background: transparent; font-weight: 680; font-size: 13px; cursor: pointer; }
    .quiet-link svg, .text-action svg { width: 16px; }
    .primary-action { display: inline-flex; align-items: center; gap: 9px; padding: 11px 15px; border: 1px solid #e97620; border-radius: 9px; color: var(--blue); background: var(--accent); font-weight: 750; font-size: 13px; cursor: pointer; transition: border-color .2s ease, transform .2s ease, opacity .2s ease; }
    .primary-action:hover { border-color: var(--blue); }
    .primary-action:active { transform: translateY(1px); }
    .primary-action:disabled { cursor: wait; opacity: .7; }
    .primary-action svg { width: 16px; }
    .action-status { margin: 13px 0 0 !important; color: var(--blue) !important; font-weight: 650; }
    .action-status[hidden] { display: none; }
    .application-list { border-top: 1px solid var(--line); }
    .application-list.compact { border-top: 0; }
    .application-row { display: grid; grid-template-columns: 46px minmax(0,1fr) auto; gap: 18px; align-items: center; padding: 24px 2px; border-bottom: 1px solid var(--line); }
    .application-index { color: #84908c; font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 11px; }
    .application-row h3 { margin: 0 0 5px; font-size: 15px; }
    .application-row p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .state-label { padding: 5px 8px; border-radius: 6px; color: var(--blue); background: var(--blue-soft); font-size: 10px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; }
    .state-label.blocked { color: #994408; background: var(--accent-soft); }
    .compact-hero { padding-bottom: 34px; border-bottom: 2px solid var(--blue); }
    .compact-hero h1 { margin-bottom: 0; }
    .home-actions { display: grid; grid-template-columns: 1.35fr 1fr; margin-top: 42px; border-top: 1px solid var(--line); }
    .home-actions button { display: grid; grid-template-columns: 1fr auto auto; gap: 18px; align-items: center; min-height: 88px; padding: 22px 20px; border: 0; border-bottom: 1px solid var(--line); color: var(--ink); background: transparent; text-align: left; cursor: pointer; transition: color .2s ease, background-color .2s ease, transform .2s ease; }
    .home-actions button:first-child { border-right: 1px solid var(--line); }
    .home-actions button:hover { color: var(--blue); background: var(--surface); }
    .home-actions button:active { transform: translateY(1px); }
    .home-actions button > span { font-size: 16px; font-weight: 700; }
    .home-actions button strong { color: var(--muted); font-size: 11px; font-weight: 620; }
    .home-actions button svg { width: 17px; color: var(--accent-strong); }
    .history-heading { display: flex; align-items: end; justify-content: space-between; gap: 30px; border-bottom: 2px solid var(--blue); }
    .history-heading h1 { margin-bottom: 0; }
    .breadcrumb { margin-bottom: 14px; color: var(--muted); font-size: 11px; font-weight: 650; }
    .breadcrumb span { padding: 0 7px; color: #9aa7b8; }
    .page-count { display: flex; align-items: baseline; gap: 7px; padding-bottom: 9px; }
    .page-count strong { color: var(--blue); font-size: 30px; letter-spacing: -.04em; }
    .page-count span { color: var(--muted); font-size: 11px; }
    .period-picker { display: grid; grid-template-columns: minmax(220px, 340px) 1fr; gap: 7px 20px; align-items: end; padding: 24px 0 20px; }
    .period-label { grid-column: 1; color: var(--blue); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .period-select-wrap { position: relative; grid-column: 1; min-height: 44px; }
    .period-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; padding: 0 44px 0 14px; border: 1px solid #cfd9e6; border-radius: 8px; outline: 0; color: var(--ink); background: #fff; font: inherit; font-size: 13px; font-weight: 700; text-align: left; cursor: pointer; transition: border-color .2s ease, box-shadow .2s ease; }
    .period-trigger:hover { border-color: var(--blue); }
    .period-trigger:focus-visible { border-color: var(--accent-strong); box-shadow: 0 0 0 3px rgba(255, 128, 32, .16); }
    .period-trigger:disabled { color: var(--muted); cursor: wait; background: var(--surface); }
    .period-select-arrow { position: absolute; top: 50%; right: 14px; width: 16px; height: 16px; color: var(--accent-strong); pointer-events: none; transform: translateY(-50%) rotate(90deg); }
    .period-select-arrow svg { display: block; width: 16px; height: 16px; }
    .period-trigger[aria-expanded="true"] .period-select-arrow { transform: translateY(-50%) rotate(-90deg); }
    .period-options { position: absolute; z-index: 5; top: calc(100% + 6px); left: 0; width: 100%; max-height: 260px; overflow-y: auto; padding: 5px; border: 1px solid #cfd9e6; border-radius: 9px; background: #fff; box-shadow: 0 16px 34px rgba(13, 50, 101, .14); }
    .period-options[hidden] { display: none; }
    .period-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 38px; padding: 8px 10px; border: 0; border-radius: 6px; color: var(--ink); background: transparent; font: inherit; font-size: 12px; font-weight: 650; text-align: left; cursor: pointer; }
    .period-option:hover, .period-option:focus-visible { outline: 0; color: var(--blue); background: var(--blue-soft); }
    .period-option[aria-selected="true"] { color: var(--blue); background: var(--accent-soft); font-weight: 800; }
    .period-option svg { flex: 0 0 auto; width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; }
    .period-status { grid-column: 2; align-self: center; margin: 0; color: var(--muted); font-size: 12px; }
    .period-status[hidden] { display: none; }
    .history-table-wrap { max-width: 100%; overflow-x: auto; border-top: 1px solid var(--line); }
    .history-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .history-table th { padding: 13px 12px; color: var(--muted); font-size: 9px; letter-spacing: .08em; text-align: left; text-transform: uppercase; white-space: nowrap; }
    .history-table td { padding: 18px 12px; border-top: 1px solid var(--line); vertical-align: top; }
    .history-table td:first-child { min-width: 210px; }
    .history-table td strong, .history-table td span { display: block; }
    .history-table td strong { color: var(--blue); font-size: 11px; }
    .history-table td span { margin-top: 4px; color: var(--ink); font-size: 13px; }
    .history-table td small { display: block; margin-top: 3px; color: var(--muted); font-size: 9px; white-space: nowrap; }
    .history-grade { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--blue); background: var(--accent-soft); font-size: 14px; }
    .history-empty { padding: 40px 0; border-bottom: 1px solid var(--line); }
    .history-empty h2 { margin-bottom: 9px; font-size: 24px; }
    .history-empty p { max-width: 620px; margin-bottom: 14px; color: var(--muted); font-size: 13px; line-height: 1.6; }
    .period-empty { min-height: 150px; padding-top: 34px; }
    .history-loading { display: grid; grid-template-columns: minmax(0,1fr) minmax(240px,.7fr); gap: 42px; align-items: center; min-height: 270px; padding: 42px 0; border-bottom: 1px solid var(--line); }
    .loading-rule { display: block; width: 34px; height: 3px; margin-bottom: 20px; background: var(--accent); }
    .loading-copy h2 { margin-bottom: 8px; font-size: 24px; }
    .loading-copy p { margin: 0; color: var(--muted); font-size: 13px; }
    .history-skeleton { display: grid; gap: 11px; }
    .history-skeleton span { display: block; height: 16px; border-radius: 4px; background: #e6ebf2; }
    .history-skeleton span:nth-child(1) { width: 88%; }
    .history-skeleton span:nth-child(2) { width: 100%; }
    .history-skeleton span:nth-child(3) { width: 68%; }
    .offer-heading { display: flex; align-items: end; justify-content: space-between; gap: 30px; border-bottom: 2px solid var(--blue); }
    .offer-heading h1 { margin-bottom: 0; }
    .offer-search { padding: 26px 0 28px; border-bottom: 1px solid var(--line); }
    .offer-search > label { display: block; margin-bottom: 8px; color: var(--blue); font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
    .offer-search-row { display: grid; grid-template-columns: minmax(220px, 390px) max-content; gap: 10px; align-items: stretch; }
    .offer-search-row .primary-action { min-height: 44px; }
    .offer-search input { min-width: 0; min-height: 44px; padding: 0 14px; border: 1px solid #cbd6e4; border-radius: 9px; outline: 0; color: var(--ink); background: #fff; font: inherit; font-size: 15px; font-weight: 720; letter-spacing: .04em; text-transform: uppercase; transition: border-color .2s ease, box-shadow .2s ease; }
    .offer-search input:focus { border-color: var(--accent-strong); box-shadow: 0 0 0 3px rgba(246,134,41,.16); }
    .offer-search input:disabled { color: var(--muted); background: #edf1f6; }
    .offer-search [data-offer-search-status] { margin: 10px 0 0; color: var(--blue); font-size: 12px; font-weight: 650; }
    .offer-search [data-offer-search-status][hidden] { display: none; }
    .offer-search-alternative { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
    .offer-search-alternative > span { color: var(--muted); font-size: 11px; }
    .offer-search-alternative button { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; color: var(--blue); background: transparent; font: inherit; font-size: 11px; font-weight: 760; cursor: pointer; }
    .offer-search-alternative button svg { width: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; }
    .offer-search-alternative button:disabled { color: var(--muted); cursor: default; }
    .offer-lookup { margin-top: 28px; padding: 24px 0 26px; border-top: 2px solid var(--accent-strong); border-bottom: 1px solid var(--line); }
    .offer-lookup > header { display: flex; align-items: start; justify-content: space-between; gap: 24px; }
    .offer-lookup > header h2 { margin: 5px 0 0; color: var(--ink); font-size: 24px; letter-spacing: -.03em; }
    .offer-lookup > header > button { padding: 5px 0; border: 0; color: var(--blue); background: transparent; font: inherit; font-size: 11px; font-weight: 760; cursor: pointer; }
    .offer-lookup > form { max-width: 760px; padding: 22px 0 18px; }
    .offer-lookup > form > label { display: block; margin-bottom: 8px; color: var(--blue); font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
    .offer-lookup-search-row { display: grid; grid-template-columns: minmax(240px, 1fr) max-content; gap: 10px; }
    .offer-lookup-search-row input { min-width: 0; min-height: 44px; padding: 0 14px; border: 1px solid #cbd6e4; border-radius: 9px; outline: 0; color: var(--ink); background: #fff; font: inherit; font-size: 14px; transition: border-color .2s ease, box-shadow .2s ease; }
    .offer-lookup-search-row input:focus { border-color: var(--accent-strong); box-shadow: 0 0 0 3px rgba(246,134,41,.16); }
    .offer-lookup [data-offer-lookup-status] { margin: 10px 0 0; color: var(--blue); font-size: 12px; font-weight: 650; }
    .offer-lookup [data-offer-lookup-status][hidden] { display: none; }
    .offer-lookup-summary { display: flex; align-items: baseline; gap: 7px; padding: 5px 0 13px; color: var(--muted); font-size: 11px; }
    .offer-lookup-summary strong { color: var(--blue); font-size: 20px; }
    .offer-lookup-list { border-top: 1px solid var(--blue); }
    .offer-lookup-option { display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 20px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--line); }
    .offer-lookup-option span { color: var(--accent-deep); font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 10px; font-weight: 820; letter-spacing: .06em; }
    .offer-lookup-option h3 { margin: 4px 0 0; color: var(--ink); font-size: 14px; line-height: 1.35; }
    .offer-lookup-option button { display: inline-flex; align-items: center; gap: 5px; padding: 8px 0 8px 12px; border: 0; color: var(--blue); background: transparent; font: inherit; font-size: 11px; font-weight: 780; cursor: pointer; }
    .offer-lookup-option button svg { width: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; }
    .offer-lookup-option button:active { transform: translateY(1px); }
    .offer-lookup-empty { min-height: 90px; padding: 20px 0 4px; }
    .offer-lookup-empty strong { color: var(--ink); font-size: 15px; }
    .offer-lookup-empty p { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
    .offer-lookup-loading { display: grid; gap: 10px; padding: 18px 0 4px; }
    .offer-lookup-loading span { display: block; height: 17px; border-radius: 4px; background: #e6ebf2; }
    .offer-lookup-loading span:nth-child(1) { width: 46%; }
    .offer-lookup-loading span:nth-child(2) { width: 82%; }
    .offer-lookup-loading span:nth-child(3) { width: 64%; }
    .offer-result-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; padding: 34px 0 20px; }
    .offer-result-heading h2 { margin: 7px 0 0; color: var(--ink); font-size: 26px; letter-spacing: -.035em; }
    .offer-result-heading > span { color: var(--muted); font-size: 11px; }
    .offer-result-heading > span strong { color: var(--blue); font-size: 24px; }
    .offer-list { border-top: 2px solid var(--blue); }
    .offer-row { padding: 24px 2px 0; border-bottom: 1px solid var(--line); }
    .offer-row > header { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
    .offer-code { color: var(--accent-strong); font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 10px; font-weight: 800; letter-spacing: .06em; }
    .offer-row h3 { margin: 5px 0 0; color: var(--blue); font-size: 17px; letter-spacing: -.02em; }
    .offer-tags { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; }
    .offer-section-code { padding: 6px 9px; border: 1px solid #cdd9e9; border-radius: 999px; color: var(--blue); font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 9px; font-weight: 760; letter-spacing: .03em; }
    .offer-modality { padding: 6px 9px; border-radius: 999px; color: var(--blue); background: var(--blue-soft); font-size: 10px; font-weight: 760; }
    .offer-primary-data { display: grid; grid-template-columns: minmax(280px, 2fr) repeat(3, minmax(90px, .6fr)); margin-top: 22px; padding-bottom: 20px; }
    .offer-primary-data > div { min-width: 0; padding: 0 18px; border-left: 1px solid var(--line); }
    .offer-primary-data > div:first-child { padding-left: 0; border-left: 0; }
    .offer-primary-data > div > span, .offer-details dt { display: block; margin-bottom: 6px; color: var(--muted); font-size: 9px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; }
    .offer-primary-data > div > strong { display: block; color: var(--ink); font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
    .offer-meetings { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 7px 18px; margin: 0; padding: 0; list-style: none; }
    .offer-meetings li { display: grid; grid-template-columns: 62px minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; padding: 5px 0; border-bottom: 1px solid #e3e9f1; }
    .offer-meetings li span { color: var(--blue); font-size: 11px; font-weight: 760; }
    .offer-meetings li strong { color: var(--ink); font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 11px; font-weight: 680; overflow-wrap: anywhere; }
    .offer-details { border-top: 1px solid var(--line); }
    .offer-details summary { display: flex; align-items: center; gap: 7px; width: max-content; padding: 12px 0 15px; color: var(--blue); font-size: 11px; font-weight: 700; cursor: pointer; list-style: none; }
    .offer-details summary::-webkit-details-marker { display: none; }
    .offer-details summary svg { width: 14px; transform: rotate(90deg); transition: transform .2s ease; }
    .offer-details[open] summary svg { transform: rotate(-90deg); }
    .offer-details dl { display: grid; grid-template-columns: 1.4fr .7fr .8fr; gap: 22px; margin: 0; padding: 2px 0 22px; }
    .offer-details dd { margin: 0; color: var(--ink); font-size: 12px; line-height: 1.45; }
    .offer-empty { min-height: 190px; padding: 42px 0; border-bottom: 1px solid var(--line); }
    .offer-empty.compact { min-height: 150px; }
    .offer-empty h2 { margin-bottom: 8px; font-size: 24px; }
    .offer-empty p { max-width: 590px; margin-bottom: 16px; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .offer-loading { display: grid; grid-template-columns: minmax(0,1fr) minmax(230px,.7fr); gap: 42px; align-items: center; min-height: 280px; padding: 42px 0; border-bottom: 1px solid var(--line); }
    .offer-loading.inline { min-height: 190px; padding: 34px 0; }
    .offer-loading h2 { margin-bottom: 8px; font-size: 24px; }
    .offer-loading p { margin: 0; color: var(--muted); font-size: 13px; }
    .offer-skeleton { display: grid; gap: 11px; }
    .offer-skeleton span { display: block; height: 18px; border-radius: 4px; background: #e6ebf2; }
    .offer-skeleton span:nth-child(1) { width: 72%; }
    .offer-skeleton span:nth-child(2) { width: 100%; }
    .offer-skeleton span:nth-child(3) { width: 84%; }
    .withdrawn-control { display: flex; align-items: center; gap: 14px; max-width: 680px; padding: 11px 0 16px; }
    .withdrawn-control label { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); font-size: 13px; font-weight: 700; cursor: pointer; }
    .withdrawn-control input { width: 17px; height: 17px; margin: 0; accent-color: var(--accent-strong); cursor: pointer; }
    .withdrawn-control input:disabled { cursor: wait; opacity: .65; }
    .withdrawn-control p { margin: 0; color: var(--accent-deep); font-size: 11px; }
    .withdrawn-control p[hidden] { display: none; }
    .program-list { display: grid; max-width: 680px; border-top: 1px solid var(--line); }
    .program-action { display: flex; align-items: center; justify-content: space-between; gap: 20px; width: 100%; padding: 18px 2px; border: 0; border-bottom: 1px solid var(--line); color: var(--blue); background: transparent; font: inherit; font-size: 14px; font-weight: 800; text-align: left; cursor: pointer; }
    .program-action:hover { color: var(--accent-deep); }
    .program-action:disabled { color: var(--muted); cursor: wait; }
    .program-action svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; }
    .academic-overview { border-top: 1px solid var(--line); }
    .overview-group { display: grid; grid-template-columns: 44px minmax(0,1fr) auto; gap: 18px; align-items: center; padding: 25px 2px; border-bottom: 1px solid var(--line); }
    .overview-number { color: var(--accent-strong); font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 12px; font-weight: 760; }
    .overview-group h3 { margin: 0 0 5px; color: var(--blue); font-size: 16px; }
    .overview-group p { max-width: 610px; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .overview-safe { padding: 6px 9px; border: 1px solid #f1c197; border-radius: 999px; color: #8c4009; background: var(--accent-soft); font-size: 10px; font-weight: 760; letter-spacing: .04em; text-transform: uppercase; }
    .academic-heading { display: block; }
    .academic-summary { padding: 10px 0 6px 24px; border-left: 3px solid var(--accent); }
    .academic-summary strong { color: var(--blue); font-size: clamp(36px,5vw,60px); font-weight: 600; letter-spacing: -.06em; }
    .academic-summary p { max-width: 170px; margin: 9px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .process-groups { display: grid; gap: 58px; }
    .process-group { border-top: 2px solid var(--blue); }
    .process-group > header { padding: 22px 0; border-bottom: 1px solid var(--line); }
    .process-group > header h2 { margin: 7px 0 0; color: var(--blue); font-size: 24px; letter-spacing: -.035em; }
    .process-group > header p { max-width: 540px; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .process-row { display: grid; grid-template-columns: 12px minmax(0,1fr) auto; gap: 16px; align-items: center; min-height: 82px; padding: 17px 0; border-bottom: 1px solid var(--line); }
    .process-row-action { width: 100%; border: 0; border-bottom: 1px solid var(--line); color: inherit; background: transparent; text-align: left; cursor: pointer; transition: color .2s ease, background-color .2s ease; }
    .process-row-action:hover { color: var(--blue); background: var(--surface); }
    .process-presence { width: 7px; height: 7px; border: 1px solid #b9aea5; border-radius: 50%; background: transparent; }
    .process-presence.detected { border-color: var(--accent); background: var(--accent); box-shadow: 0 0 0 4px rgba(246,134,41,.11); }
    .process-row h3 { margin: 0 0 5px; color: var(--ink); font-size: 14px; }
    .process-row p { max-width: 590px; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .process-meta { display: flex; align-items: center; justify-content: end; gap: 9px; }
    .process-source { color: #847970; font-size: 10px; }
    .process-mode { min-width: 96px; padding: 6px 8px; border-radius: 6px; text-align: center; font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
    .process-mode.read-only { color: var(--blue); background: var(--blue-soft); }
    .process-mode.reference { color: #81400e; background: var(--accent-soft); }
    .process-mode.blocked { color: #6e625b; background: #eee9e4; }
    .process-groups { gap: 18px; }
    .process-group { border-top: 0; border-bottom: 1px solid var(--line); scroll-margin-top: 94px; }
    .process-group > summary { display: flex; align-items: center; justify-content: space-between; min-height: 72px; padding: 0 2px; color: var(--blue); cursor: pointer; list-style: none; }
    .process-group > summary::-webkit-details-marker { display: none; }
    .process-group > summary span { display: flex; align-items: baseline; gap: 16px; }
    .process-group > summary small { color: var(--accent-strong); font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 10px; }
    .process-group > summary strong { font-size: 18px; letter-spacing: -.02em; }
    .process-group > summary > svg { width: 17px; color: var(--accent-strong); transform: rotate(90deg); transition: transform .2s ease; }
    .process-group:not([open]) > summary > svg { transform: rotate(0); }
    .process-list { padding-left: 34px; border-top: 1px solid var(--line); }
    .process-row { grid-template-columns: minmax(0,1fr) auto; min-height: 62px; padding: 13px 2px; }
    .process-row h3 { margin: 0; font-size: 13px; font-weight: 680; }
    .process-row > svg { width: 16px; color: var(--accent-strong); }
    .process-row[aria-disabled="true"] { color: #596a7c; }
    .process-destination { min-height: 68px; padding: 22px 2px; border-bottom: 1px solid var(--line); scroll-margin-top: 94px; }
    .process-destination h2 { margin: 0; color: var(--blue); font-size: 17px; letter-spacing: -.02em; }
    .secondary-heading { margin-top: 64px; }
    .detected-app-count { color: var(--muted); font-size: 12px; }
    .detected-app-count span { color: var(--blue); font-family: ui-monospace, "Cascadia Mono", monospace; font-weight: 750; }
    .empty-state { padding: 37px 0 28px; border-bottom: 1px solid var(--line); }
    .empty-rule { display: block; width: 33px; height: 2px; margin-bottom: 18px; background: #a9b5b0; }
    .empty-state h3 { margin-bottom: 8px; font-size: 15px; }
    .empty-state p { max-width: 560px; margin-bottom: 10px; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .page-heading { padding-bottom: 45px; }
    .page-heading h1 { font-size: clamp(38px, 5vw, 58px); }
    .boundary-note { margin-top: 38px; padding: 20px 0; border-top: 2px solid var(--ink); border-bottom: 1px solid var(--line); }
    .boundary-note strong { font-size: 14px; }
    .boundary-note p { max-width: 700px; margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
    .safety-list { border-top: 2px solid var(--ink); }
    .safety-list > div { display: grid; grid-template-columns: 55px minmax(150px,.7fr) 1fr; gap: 22px; padding: 25px 0; border-bottom: 1px solid var(--line); }
    .safety-list span { color: #84908c; font-family: ui-monospace, "Cascadia Mono", monospace; font-size: 11px; }
    .safety-list h3 { margin: 0; font-size: 15px; }
    .safety-list p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .return-button { position: static; pointer-events: auto; border-color: #e97620; color: var(--blue); background: var(--accent); box-shadow: 0 14px 34px rgba(124,52,5,.2); }
    .return-button[hidden] { display: none; }
    @keyframes enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 760px) {
      :host { max-width: 100vw; }
      .viewport { display: block; padding-bottom: 0; }
      .sidebar { position: fixed; inset: auto 0 0; min-height: 0; height: calc(68px + env(safe-area-inset-bottom)); padding: 7px 14px calc(7px + env(safe-area-inset-bottom)); z-index: 3; }
      .brand { display: none; }
      .navigation { grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 0; }
      .nav-section { display: contents; }
      .nav-tree { display: none; }
      .nav-label-wide { display: none; }
      .nav-label-mobile { display: inline; }
      .nav-item { flex-direction: column; justify-content: center; gap: 2px; padding: 5px; font-size: 10px; }
      .nav-item.is-active { box-shadow: inset 3px 0 0 var(--accent), inset -3px 0 0 var(--accent); }
      .nav-item svg { width: 19px; height: 19px; }
      .content { height: calc(100dvh - 68px - env(safe-area-inset-bottom)); }
      .topbar { min-height: 62px; padding: max(11px, env(safe-area-inset-top)) 17px 11px; }
      .context-label { display: none; }
      .original-button span { display: none; }
      .original-button { padding: 9px; }
      .panel { padding: 38px 18px 58px; }
      .hero-grid { grid-template-columns: 1fr; gap: 34px; }
      .hero-copy h1 { font-size: clamp(36px, 11vw, 51px); }
      .metric-block { padding-left: 0; border-left: 0; border-top: 1px solid var(--line); padding-top: 21px; }
      .metric-block p { max-width: 210px; }
      .status-banner { margin-top: 35px; padding: 16px; }
      .section-heading { margin-top: 46px; }
      .application-row { grid-template-columns: 35px 1fr; gap: 12px; }
      .state-label { grid-column: 2; justify-self: start; }
      .overview-group { grid-template-columns: 34px 1fr; gap: 12px; }
      .overview-safe { grid-column: 2; justify-self: start; }
      .compact-hero { padding-bottom: 27px; }
      .home-actions { grid-template-columns: 1fr; margin-top: 28px; }
      .home-actions button:first-child { border-right: 0; }
      .history-heading { align-items: flex-start; flex-direction: column; gap: 6px; }
      .history-heading h1 { max-width: 100%; font-size: 34px; line-height: 1.02; overflow-wrap: anywhere; }
      .offer-heading { align-items: flex-start; flex-direction: column; gap: 6px; }
      .offer-heading h1 { max-width: 100%; font-size: 36px; line-height: 1.02; }
      .offer-search { padding-top: 21px; }
      .offer-search-row { grid-template-columns: 1fr; }
      .offer-search-row .primary-action { justify-content: center; width: 100%; }
      .offer-search-alternative { align-items: flex-start; flex-direction: column; gap: 7px; }
      .offer-lookup { margin-top: 22px; padding-top: 20px; }
      .offer-lookup > header h2 { font-size: 21px; }
      .offer-lookup-search-row { grid-template-columns: 1fr; }
      .offer-lookup-search-row .primary-action { justify-content: center; width: 100%; }
      .offer-lookup-option { grid-template-columns: 1fr; gap: 8px; }
      .offer-lookup-option button { justify-content: space-between; width: 100%; padding: 7px 0; }
      .offer-result-heading { align-items: flex-start; flex-direction: column; gap: 10px; }
      .offer-result-heading h2 { font-size: 22px; }
      .offer-row { padding-top: 20px; }
      .offer-row > header { align-items: flex-start; flex-direction: column; gap: 12px; }
      .offer-tags { justify-content: flex-start; }
      .offer-primary-data { grid-template-columns: 1fr 1fr; gap: 20px 14px; }
      .offer-primary-data > div { padding: 0; border-left: 0; }
      .offer-primary-data > div:first-child { grid-column: 1 / -1; }
      .offer-meetings { grid-template-columns: 1fr; gap: 0; }
      .offer-details dl { grid-template-columns: 1fr; gap: 17px; }
      .offer-loading { grid-template-columns: 1fr; gap: 28px; min-height: 300px; }
      .breadcrumb { line-height: 1.5; }
      .page-count { padding-bottom: 12px; }
      .period-picker { grid-template-columns: 1fr; padding: 20px 0 16px; }
      .period-label, .period-select-wrap, .period-status { grid-column: 1; }
      .history-table-wrap { overflow: visible; border-top: 0; }
      .history-table, .history-table tbody, .history-table tr, .history-table td { display: block; }
      .history-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .history-table tr { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; padding: 18px 0; border-top: 1px solid var(--line); }
      .history-table td { display: grid; grid-template-columns: 86px 1fr; align-items: baseline; min-width: 0 !important; padding: 8px 0; border-top: 0; }
      .history-table td:first-child { grid-column: 1 / -1; display: block; padding-bottom: 13px; }
      .history-table td::before { content: attr(data-label); color: var(--muted); font-size: 9px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
      .history-table td:first-child::before { display: none; }
      .history-table td strong, .history-table td span { display: block; }
      .history-grade { display: inline-grid; }
      .academic-heading { grid-template-columns: 1fr; gap: 30px; }
      .academic-summary { padding: 19px 0 0; border-top: 2px solid var(--accent); border-left: 0; }
      .history-loading { grid-template-columns: 1fr; gap: 28px; min-height: 300px; }
      .process-groups { gap: 8px; }
      .process-list { padding-left: 15px; }
      .process-row { grid-template-columns: 1fr auto; gap: 12px; }
      .process-meta { grid-column: 2; justify-content: start; flex-wrap: wrap; }
      .safety-list > div { grid-template-columns: 35px 1fr; gap: 13px; }
      .safety-list p { grid-column: 2; }
      .return-button span { display: inline; }
    }
    @media (max-width: 430px) {
      .panel { padding-inline: 15px; }
      .history-table tr { grid-template-columns: 1fr; gap: 0; }
      .history-table td, .history-table td:first-child { grid-column: 1; }
      .offer-primary-data { grid-template-columns: 1fr; }
      .offer-primary-data > div:first-child { grid-column: 1; }
      .process-row { grid-template-columns: 1fr; }
      .process-meta { grid-column: 1; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; } }
  </style>`;
}

function requiredElement<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`BetterSirius shell invariant failed for selector: ${selector}`);
  return element;
}
