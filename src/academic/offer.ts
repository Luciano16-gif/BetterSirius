import type {
  AcademicOfferLookupModel,
  AcademicOfferLookupOption,
  AcademicOfferModel,
  AcademicOffering,
} from "../core/types";
import { normalizedText } from "../detection/text";

type OfferingField = Exclude<keyof AcademicOffering, "schedules">;
const LOOKUP_TRANSITION_TIMEOUT_MS = 20_000;

const HEADER_ALIASES: Readonly<Record<OfferingField, readonly string[]>> = {
  code: ["codigo", "codigo de asignatura", "cod asignatura"],
  name: ["asignatura", "nombre asignatura", "materia"],
  credits: ["creditos", "credito"],
  period: ["periodo", "periodo academico"],
  block: ["bloque", "seccion"],
  blockDescription: ["descripcion bloque", "descripcion de bloque"],
  schedule: ["horario"],
  capacity: ["cupo", "capacidad"],
  prerequisite: ["prelaciones prerrequisito", "prelacion prerrequisito", "prerrequisito"],
  prerequisiteCode: [
    "cod prelaciones prerrequisito",
    "codigo prelaciones prerrequisito",
    "cod prerrequisito",
  ],
  modality: ["modalidad"],
  firstMonthCost: ["costo primer mes", "costo del primer mes"],
};

export type AcademicOfferSearchResult = "activated" | "invalid" | "not-found" | "busy";

export class AcademicOfferController {
  readonly #rootDocument: Document;
  #busy = false;

  constructor(rootDocument: Document) {
    this.#rootDocument = rootDocument;
  }

  async search(rawCode: string): Promise<AcademicOfferSearchResult> {
    if (this.#busy) return "busy";
    const code = normalizeCourseCode(rawCode);
    if (!code) return "invalid";

    this.#busy = true;
    try {
      const target = await ensureAcademicOfferControls(this.#rootDocument);
      if (!target) return "not-found";
      return activateTextSearch(target, code) ? "activated" : "not-found";
    } finally {
      this.#busy = false;
    }
  }

  async openLookup(): Promise<AcademicOfferSearchResult> {
    if (this.#busy) return "busy";

    this.#busy = true;
    try {
      const controls = await ensureAcademicOfferControls(this.#rootDocument);
      if (!controls) return "not-found";
      const action = locateValueHelpAction(this.#rootDocument);
      if (!action) return "not-found";
      action.click();
      return "activated";
    } finally {
      this.#busy = false;
    }
  }

  async searchLookup(rawQuery: string): Promise<AcademicOfferSearchResult> {
    if (this.#busy) return "busy";
    const query = normalizeLookupQuery(rawQuery);
    if (!query) return "invalid";

    this.#busy = true;
    try {
      let target = locateLookupControls(this.#rootDocument);
      if (!target) {
        const controls = await ensureAcademicOfferControls(this.#rootDocument);
        if (!controls) return "not-found";
        const openAction = locateValueHelpAction(this.#rootDocument);
        if (!openAction) return "not-found";
        openAction.click();
        target = await waitForLookupControls(this.#rootDocument);
      }
      if (!target) return "not-found";
      return activateTextSearch(target, nativeLookupPattern(query)) ? "activated" : "not-found";
    } finally {
      this.#busy = false;
    }
  }

  async selectLookup(option: AcademicOfferLookupOption): Promise<AcademicOfferSearchResult> {
    if (this.#busy) return "busy";
    const normalizedCode = normalizeCourseCode(option.code);
    if (!normalizedCode || option.index < 0 || !option.name.trim()) return "invalid";

    this.#busy = true;
    try {
      const lookupDocument = locateActiveLookupDocument(this.#rootDocument);
      if (lookupDocument) {
        if (!lookupContainsOption(lookupDocument, option)) return "not-found";
        const closeAction = locateLookupCloseAction(lookupDocument);
        if (!closeAction) return "not-found";
        closeAction.click();
        if (!await waitForActiveLookupToClose(this.#rootDocument)) return "not-found";
      }
      const target = await ensureAcademicOfferControls(this.#rootDocument);
      if (!target) return "not-found";
      return activateTextSearch(target, normalizedCode) ? "activated" : "not-found";
    } finally {
      this.#busy = false;
    }
  }

  closeLookup(): AcademicOfferSearchResult {
    if (this.#busy) return "busy";
    const lookupDocument = locateActiveLookupDocument(this.#rootDocument);
    if (!lookupDocument) return "activated";
    const action = lookupDocument ? locateLookupCloseAction(lookupDocument) : null;
    if (!action) return "not-found";

    this.#busy = true;
    try {
      action.click();
      return "activated";
    } finally {
      this.#busy = false;
    }
  }
}

export function readAcademicOffer(document: Document): AcademicOfferModel {
  const documents = reachableDocuments(document);
  const lookup = readAcademicOfferLookup(documents);
  const lookupPart = lookup ? { lookup } : {};
  const reads = documents.flatMap((currentDocument) =>
    Array.from(currentDocument.querySelectorAll("table")).map(readOfferTable),
  );
  const offerings = deduplicateOfferings(reads.flatMap((read) => read.offerings));
  if (offerings.length > 0) return { state: "results", offerings, ...lookupPart };
  if (reads.some((read) => read.compatible)) return { state: "empty", offerings: [], ...lookupPart };

  const offerDocument = documents.find(isAcademicOfferDocument);
  if (!offerDocument) return { state: "unavailable", offerings: [], ...lookupPart };
  return locateControlsInDocument(offerDocument)
    ? { state: "initial", offerings: [], ...lookupPart }
    : { state: "unknown", offerings: [], ...lookupPart };
}

interface OfferTableRead {
  readonly compatible: boolean;
  readonly offerings: readonly AcademicOffering[];
}

interface LookupTableEntry {
  readonly option: AcademicOfferLookupOption;
}

interface LookupTableRead {
  readonly compatible: boolean;
  readonly entries: readonly LookupTableEntry[];
}

interface LookupCandidateRow {
  readonly row: HTMLTableRowElement;
  readonly cells: HTMLTableCellElement[];
}

type AcademicOfferingWithoutSchedules = Omit<AcademicOffering, "schedules">;
type MutableAcademicOffering = {
  -readonly [Key in keyof AcademicOfferingWithoutSchedules]: AcademicOfferingWithoutSchedules[Key];
};

interface OfferingAccumulator {
  readonly offering: MutableAcademicOffering;
  readonly schedules: string[];
}

function readOfferTable(table: HTMLTableElement): OfferTableRead {
  const rows = Array.from(table.rows).filter((row) => row.closest("table") === table);
  const headerIndex = rows.findIndex((row) => {
    const headers = directCells(row).map((cell) => canonicalHeader(cell.textContent));
    return findFieldIndex(headers, "code") >= 0
      && findFieldIndex(headers, "name") >= 0
      && ["block", "schedule", "capacity", "modality"]
        .filter((field) => findFieldIndex(headers, field as OfferingField) >= 0).length >= 2;
  });
  if (headerIndex < 0) return { compatible: false, offerings: [] };

  const headers = directCells(rows[headerIndex]!).map((cell) => canonicalHeader(cell.textContent));
  const indexes = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as OfferingField[]).map((field) => [field, findFieldIndex(headers, field)]),
  ) as Record<OfferingField, number>;
  let previousIdentity: Pick<AcademicOffering, "code" | "name" | "credits" | "period"> | undefined;
  let currentSection = "";
  const sections = new Map<string, OfferingAccumulator>();

  rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
    const rawValues = directCells(row).map((cell) => cleanText(cell.textContent));
    const values = alignContinuationRow(rawValues, headers.length, indexes);
    const rawCode = valueAt(values, indexes.code);
    const rawName = valueAt(values, indexes.name);
    const code = rawCode || previousIdentity?.code || "";
    const name = rawName || previousIdentity?.name || "";
    if (!code || !name) return;

    if (rawCode && rawCode !== previousIdentity?.code) currentSection = "";
    const block = valueAt(values, indexes.block);
    const blockDescription = valueAt(values, indexes.blockDescription);
    const explicitSection = block || blockDescription;
    if (explicitSection) currentSection = canonicalSectionIdentity(explicitSection);
    if (!currentSection) currentSection = `row-${rowIndex}`;

    const key = `${code}\u0000${currentSection}`;
    const existing = sections.get(key);
    const accumulator: OfferingAccumulator = existing ?? {
      offering: { code, name },
      schedules: [],
    };
    if (!existing) {
      sections.set(key, accumulator);
    }

    mergeIfMissing(accumulator.offering, "credits", valueAt(values, indexes.credits) || previousIdentity?.credits || "");
    mergeIfMissing(accumulator.offering, "period", valueAt(values, indexes.period) || previousIdentity?.period || "");
    mergeIfMissing(accumulator.offering, "block", block);
    mergeIfMissing(accumulator.offering, "blockDescription", blockDescription);
    mergeIfMissing(accumulator.offering, "capacity", valueAt(values, indexes.capacity));
    mergeIfMissing(accumulator.offering, "prerequisite", valueAt(values, indexes.prerequisite));
    mergeIfMissing(accumulator.offering, "prerequisiteCode", valueAt(values, indexes.prerequisiteCode));
    mergeIfMissing(accumulator.offering, "modality", valueAt(values, indexes.modality));
    mergeIfMissing(accumulator.offering, "firstMonthCost", valueAt(values, indexes.firstMonthCost));
    const schedule = valueAt(values, indexes.schedule);
    if (schedule && !accumulator.schedules.includes(schedule)) accumulator.schedules.push(schedule);

    previousIdentity = {
      code,
      name,
      ...(accumulator.offering.credits ? { credits: accumulator.offering.credits } : {}),
      ...(accumulator.offering.period ? { period: accumulator.offering.period } : {}),
    };
  });

  const offerings = Array.from(sections.values(), ({ offering, schedules }) => ({
    ...offering,
    ...(schedules[0] ? { schedule: schedules[0], schedules } : {}),
  }));
  return { compatible: true, offerings };
}

function readAcademicOfferLookup(documents: readonly Document[]): AcademicOfferLookupModel | undefined {
  const lookupDocument = documents.find(isAcademicOfferLookupDocument);
  if (!lookupDocument) return undefined;
  const reads = Array.from(lookupDocument.querySelectorAll("table")).map(readLookupTable);
  const compatibleReads = reads.filter((read) => read.compatible);
  const options = deduplicateLookupOptions(compatibleReads.flatMap((read) =>
    read.entries.map((entry) => entry.option),
  ));
  if (options.length > 0) return { state: "results", options };
  if (compatibleReads.length > 0 && hasLookupEmptyMessage(lookupDocument)) {
    return { state: "empty", options: [] };
  }
  if (locateLookupControlsInDocument(lookupDocument)) return { state: "initial", options: [] };
  return compatibleReads.length > 0
    ? { state: "empty", options: [] }
    : { state: "unknown", options: [] };
}

function hasLookupEmptyMessage(document: Document): boolean {
  const text = normalizedText(document.body?.textContent);
  return ["no existen aciertos", "no se encontraron resultados", "sin coincidencias"]
    .some((message) => text.includes(message));
}

function readLookupTable(table: HTMLTableElement): LookupTableRead {
  const rows = Array.from(table.rows).filter((row) => row.closest("table") === table);
  const headerIndex = rows.findIndex((row) => {
    const headers = directCells(row).map((cell) => canonicalHeader(cell.textContent));
    return findLookupHeaderIndex(headers, "code") >= 0 && findLookupHeaderIndex(headers, "name") >= 0;
  });
  if (headerIndex < 0) return { compatible: false, entries: [] };

  const headers = directCells(rows[headerIndex]!).map((cell) => canonicalHeader(cell.textContent));
  const codeIndex = findLookupHeaderIndex(headers, "code");
  const nameIndex = findLookupHeaderIndex(headers, "name");
  const candidates = lookupCandidateRows(table, rows[headerIndex]!, codeIndex, nameIndex);
  const entries = candidates.flatMap(({ cells }, index) => {
    const codeCell = cells[codeIndex];
    const code = cleanText(codeCell?.textContent);
    const name = cleanText(cells[nameIndex]?.textContent);
    if (!codeCell || !code || !name) return [];
    return [{ option: { index, code, name } }];
  });
  return { compatible: true, entries };
}

function lookupCandidateRows(
  headerTable: HTMLTableElement,
  headerRow: HTMLTableRowElement,
  codeIndex: number,
  nameIndex: number,
): LookupCandidateRow[] {
  const headerCount = directCells(headerRow).length;
  const direct = directRows(headerTable)
    .filter((row) => row !== headerRow)
    .map((row) => ({ row, cells: directCells(row) }))
    .filter(({ cells }) => hasLookupValues(cells, codeIndex, nameIndex));
  if (direct.length > 0) return direct;

  let ancestor = headerTable.parentElement?.closest<HTMLTableElement>("table") ?? null;
  while (ancestor) {
    if (isLookupGrid(ancestor)) {
      return directRows(ancestor)
        .filter((row) => !row.contains(headerTable))
        .flatMap((row) => nestedLookupRows(row, headerCount, codeIndex, nameIndex));
    }
    ancestor = ancestor.parentElement?.closest<HTMLTableElement>("table") ?? null;
  }
  return [];
}

function isLookupGrid(table: HTMLTableElement): boolean {
  const classes = normalizedText(table.className);
  return classes.includes("urstcs") || classes.includes("urst5selcoluigeneric");
}

function nestedLookupRows(
  row: HTMLTableRowElement,
  expectedCount: number,
  codeIndex: number,
  nameIndex: number,
): LookupCandidateRow[] {
  const ownCells = directCells(row);
  if (ownCells.length >= expectedCount && hasLookupValues(ownCells, codeIndex, nameIndex)) {
    return [{ row, cells: ownCells }];
  }
  const candidates: Array<{
    readonly row: HTMLTableRowElement;
    readonly cells: HTMLTableCellElement[];
  }> = [];
  for (const table of row.querySelectorAll<HTMLTableElement>("table")) {
    for (const nestedRow of directRows(table)) {
      const cells = directCells(nestedRow);
      if (cells.length >= expectedCount && hasLookupValues(cells, codeIndex, nameIndex)) {
        candidates.push({ row: nestedRow, cells });
      }
    }
  }
  return candidates;
}

function hasLookupValues(
  cells: readonly HTMLTableCellElement[],
  codeIndex: number,
  nameIndex: number,
): boolean {
  return Boolean(cleanText(cells[codeIndex]?.textContent) && cleanText(cells[nameIndex]?.textContent));
}

function locateAcademicOfferControls(
  rootDocument: Document,
): { readonly input: HTMLInputElement; readonly action: HTMLElement } | null {
  for (const document of reachableDocuments(rootDocument)) {
    if (!isAcademicOfferDocument(document)) continue;
    const controls = locateControlsInDocument(document);
    if (controls) return controls;
  }
  return null;
}

function locateValueHelpAction(rootDocument: Document): HTMLElement | null {
  for (const document of reachableDocuments(rootDocument)) {
    if (!isAcademicOfferDocument(document) || isAcademicOfferLookupDocument(document)) continue;
    const controls = locateControlsInDocument(document);
    if (!controls) continue;
    const scope = controls.input.closest("tr") ?? controls.input.parentElement;
    if (!scope) continue;
    const candidates = Array.from(scope.querySelectorAll<HTMLElement>(
      "button, a, [role='button'], [tabindex], [ct='F4'], [class*='Fieldhelp' i], [class*='Field__help' i], [class*='HlpBtnF4' i], [class*='ValueHelp' i], img[title], img[alt]",
    )).filter((element) => element !== controls.input && element !== controls.action && isVisible(element));
    const semantic = candidates.filter((element) => {
      const description = normalizedText([
        element.textContent,
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("alt"),
        element.className,
      ].filter(Boolean).join(" "));
      return [
        "ayuda para entradas",
        "ayuda de valores",
        "seleccion de valores",
        "fieldhelp",
        "field__help--f4",
        "hlpbtnf4",
        "valuehelp",
      ]
        .some((token) => description.includes(token));
    });
    if (semantic.length === 1) return clickableOwner(semantic[0]!);
  }
  return null;
}

function locateLookupControls(
  rootDocument: Document,
): { readonly input: HTMLInputElement; readonly action: HTMLElement } | null {
  const document = locateActiveLookupDocument(rootDocument);
  return document ? locateLookupControlsInDocument(document) : null;
}

function locateActiveLookupDocument(rootDocument: Document): Document | undefined {
  return reachableDocuments(rootDocument).find(isActiveAcademicOfferLookupDocument);
}

function isActiveAcademicOfferLookupDocument(document: Document): boolean {
  if (!isAcademicOfferLookupDocument(document)) return false;
  return locateLookupControlsInDocument(document) !== null
    && locateLookupCloseAction(document) !== null;
}

function locateLookupControlsInDocument(
  document: Document,
): { readonly input: HTMLInputElement; readonly action: HTMLElement } | null {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='text']:not([disabled])"))
    .filter(isVisible);
  const semanticInputs = inputs.filter((input) => normalizedText([
    input.getAttribute("aria-label"),
    input.getAttribute("title"),
    input.getAttribute("placeholder"),
  ].filter(Boolean).join(" ")).includes("nombre o codigo de la asignatura"));
  if (semanticInputs.length !== 1) return null;
  const input = semanticInputs[0]!;
  const scope = input.closest("[role='dialog'], section, form") ?? document;
  const action = locateExactAction(scope, "buscar")
    ?? (scope === document ? null : locateExactAction(document, "buscar"));
  return action ? { input, action } : null;
}

function lookupContainsOption(
  document: Document,
  selection: AcademicOfferLookupOption,
): boolean {
  const exactMatches = Array.from(document.querySelectorAll("table")).flatMap((table) =>
    readLookupTable(table).entries,
  ).filter(({ option }) => option.code === selection.code && option.name === selection.name);
  const indexedMatches = exactMatches.filter(({ option }) => option.index === selection.index);
  const matches = indexedMatches.length === 1 ? indexedMatches : exactMatches;
  return matches.length === 1;
}

function locateLookupCloseAction(document: Document): HTMLElement | null {
  const exact = locateExactAction(document, "cerrar");
  if (exact) return exact;

  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    "button, a, [role='button'], [tabindex], [title], [aria-label], img[alt]",
  )).filter((element) => {
    if (!isVisible(element)) return false;
    const description = normalizedText([
      element.textContent,
      element.getAttribute("title"),
      element.getAttribute("aria-label"),
      element.getAttribute("alt"),
    ].filter(Boolean).join(" "));
    return description === "cerrar" || description === "cerrar ventana";
  });
  const actions = Array.from(new Set(candidates.map(clickableOwner)));
  return actions.length === 1 ? actions[0]! : null;
}

function locateExactAction(root: ParentNode, label: string): HTMLElement | null {
  const actions = Array.from(root.querySelectorAll<HTMLElement>(
    "button, a, [role='button'], [tabindex], .lsButton",
  )).filter((element) => isVisible(element) && normalizedText(element.textContent) === label);
  return actions.length === 1 ? actions[0]! : null;
}

function activateTextSearch(
  target: { readonly input: HTMLInputElement; readonly action: HTMLElement },
  text: string,
): boolean {
  target.input.focus();
  target.input.select();
  const document = target.input.ownerDocument;
  const inserted = typeof document.execCommand === "function"
    && document.execCommand("insertText", false, text);
  if (!inserted || readInputText(target.input) !== text) {
    const nativeSetter = inputValueDescriptor(target.input)?.set;
    if (nativeSetter) nativeSetter.call(target.input, text);
    else target.input.setRangeText(text);
    const InputEventConstructor = target.input.ownerDocument.defaultView?.InputEvent ?? InputEvent;
    target.input.dispatchEvent(new InputEventConstructor("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
  }
  if (readInputText(target.input) !== text) return false;
  const view = target.input.ownerDocument.defaultView;
  const EventConstructor = view?.Event ?? Event;
  const KeyboardEventConstructor = view?.KeyboardEvent ?? KeyboardEvent;
  target.input.dispatchEvent(new KeyboardEventConstructor("keyup", {
    bubbles: true,
    key: text.at(-1) ?? "Unidentified",
  }));
  target.input.dispatchEvent(new EventConstructor("change", { bubbles: true }));
  target.action.focus();
  if (readInputText(target.input) !== text) return false;
  target.action.click();
  return true;
}

function readInputText(input: HTMLInputElement): string {
  const nativeGetter = inputValueDescriptor(input)?.get;
  return String(nativeGetter?.call(input) ?? "");
}

function inputValueDescriptor(input: HTMLInputElement): PropertyDescriptor | undefined {
  let prototype: object | null = Object.getPrototypeOf(input) as object | null;
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor) return descriptor;
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return undefined;
}

async function ensureAcademicOfferControls(
  rootDocument: Document,
): Promise<{ readonly input: HTMLInputElement; readonly action: HTMLElement } | null> {
  const current = locateAcademicOfferControls(rootDocument);
  if (current) return current;

  const activeLookup = locateActiveLookupDocument(rootDocument);
  if (activeLookup) {
    const closeAction = locateLookupCloseAction(activeLookup);
    if (!closeAction) return null;
    closeAction.click();
    if (!await waitForActiveLookupToClose(rootDocument)) return null;
    const afterClose = locateAcademicOfferControls(rootDocument);
    if (afterClose) return afterClose;
  }

  const returnAction = locateAcademicOfferReturnAction(rootDocument);
  if (!returnAction) return null;
  returnAction.click();
  return waitForAcademicOfferControls(rootDocument);
}

function locateAcademicOfferReturnAction(rootDocument: Document): HTMLElement | null {
  const actions = reachableDocuments(rootDocument).flatMap((document) => {
    if (!isAcademicOfferDocument(document) || isActiveAcademicOfferLookupDocument(document)) return [];
    const exact = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => isVisible(element) && normalizedText(element.textContent) === "regresar");
    const leaves = exact.filter((element) => !Array.from(element.children)
      .some((child) => normalizedText(child.textContent) === "regresar"));
    return leaves.map(returnActionOwner);
  });
  const unique = Array.from(new Set(actions));
  return unique.length === 1 ? unique[0]! : null;
}

function returnActionOwner(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>(
    "button, a, [role='button'], [tabindex], [onclick], [ct='B'], .lsButton",
  ) ?? element;
}

async function waitForActiveLookupToClose(rootDocument: Document): Promise<boolean> {
  const deadline = Date.now() + LOOKUP_TRANSITION_TIMEOUT_MS;
  do {
    if (!locateActiveLookupDocument(rootDocument)) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return false;
}

async function waitForAcademicOfferControls(
  rootDocument: Document,
): Promise<{ readonly input: HTMLInputElement; readonly action: HTMLElement } | null> {
  const deadline = Date.now() + LOOKUP_TRANSITION_TIMEOUT_MS;
  do {
    const controls = locateAcademicOfferControls(rootDocument);
    if (controls) return controls;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return null;
}

async function waitForLookupControls(
  rootDocument: Document,
): Promise<{ readonly input: HTMLInputElement; readonly action: HTMLElement } | null> {
  const deadline = Date.now() + LOOKUP_TRANSITION_TIMEOUT_MS;
  do {
    const controls = locateLookupControls(rootDocument);
    if (controls) return controls;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return null;
}

function locateControlsInDocument(
  document: Document,
): { readonly input: HTMLInputElement; readonly action: HTMLElement } | null {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='text']:not([disabled])"))
    .filter(isVisible);
  if (inputs.length !== 1) return null;

  const actions = Array.from(
    document.querySelectorAll<HTMLElement>("button, [role='button'], [tabindex], .lsButton"),
  ).filter((element) => isVisible(element) && normalizedText(element.textContent) === "buscar");
  if (actions.length !== 1) return null;
  return { input: inputs[0]!, action: actions[0]! };
}

function isAcademicOfferDocument(document: Document): boolean {
  const title = normalizedText(document.title);
  if (title.includes("zweb_oferta_1") || title.includes("oferta academica")) return true;
  return Array.from(document.querySelectorAll("label, span[class*='Label']"))
    .some((label) => normalizedText(label.textContent) === "codigo de asignatura");
}

function isAcademicOfferLookupDocument(document: Document): boolean {
  const text = canonicalHeader(document.body?.textContent);
  if (!text.includes("busqueda codigo de asignatura")
    && !text.includes("nombre o codigo de la asignatura")) return false;
  return Array.from(document.querySelectorAll("input[type='text'], th"))
    .some((element) => normalizedText([
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ].filter(Boolean).join(" ")).includes("nombre o codigo de la asignatura")
      || canonicalHeader(element.textContent) === "abrev objeto");
}

function reachableDocuments(root: Document): Document[] {
  const documents: Document[] = [];
  const visited = new Set<Document>();
  const visit = (document: Document): void => {
    if (visited.has(document)) return;
    visited.add(document);
    documents.push(document);
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        if (!isVisible(frame)) continue;
        if (frame.contentDocument) visit(frame.contentDocument);
      } catch {
        // Cross-origin frames are intentionally opaque.
      }
    }
  };
  visit(root);
  return documents;
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.closest("[hidden], [aria-hidden='true']")) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return true;
  let current: HTMLElement | null = element;
  while (current) {
    const style = view.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
    current = current.parentElement;
  }
  return true;
}

function normalizeCourseCode(value: string): string | null {
  const code = value.trim().toLocaleUpperCase("es");
  if (!code || code.length > 12 || /[\u0000-\u001f\u007f]/.test(code)) return null;
  return code;
}

function normalizeLookupQuery(value: string): string | null {
  const query = value.replace(/\s+/g, " ").trim();
  if (query.length < 2 || query.length > 20 || /[\u0000-\u001f\u007f]/.test(query)) return null;
  return query;
}

function nativeLookupPattern(query: string): string {
  if (query.includes("*") || query.includes("?")) return query;
  if (/\s/.test(query) || query.length === 20) return query;
  return `${query}*`;
}

function directCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.querySelectorAll(":scope > th, :scope > td"));
}

function directRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).filter((row) => row.closest("table") === table);
}

function findFieldIndex(headers: readonly string[], field: OfferingField): number {
  return headers.findIndex((header) => HEADER_ALIASES[field].some((alias) => {
    const canonicalAlias = canonicalHeader(alias);
    return header === canonicalAlias || header.startsWith(`${canonicalAlias} `);
  }));
}

function findLookupHeaderIndex(headers: readonly string[], field: "code" | "name"): number {
  const aliases = field === "code"
    ? ["abrev objeto", "codigo", "codigo de asignatura"]
    : ["denominacion", "nombre", "nombre de la asignatura"];
  return headers.findIndex((header) => aliases.some((alias) => {
    const canonicalAlias = canonicalHeader(alias);
    return header === canonicalAlias || header.startsWith(`${canonicalAlias} `);
  }));
}

function canonicalHeader(value: string | null | undefined): string {
  return normalizedText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function valueAt(values: readonly string[], index: number): string {
  return index >= 0 ? values[index] ?? "" : "";
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function alignContinuationRow(
  values: readonly string[],
  columnCount: number,
  indexes: Readonly<Record<OfferingField, number>>,
): string[] {
  if (values.length >= columnCount) return values.slice(0, columnCount);

  const scheduleIndex = values.findIndex((value) => /\d{1,2}:\d{2}.*\d{1,2}:\d{2}/.test(value));
  const utilityColumnCount = Math.max(indexes.code, 0);
  if (scheduleIndex > utilityColumnCount && indexes.schedule >= 0) {
    const aligned = Array.from({ length: columnCount }, () => "");
    values.slice(0, utilityColumnCount).forEach((value, index) => {
      aligned[index] = value;
    });

    const leadingValues = values.slice(utilityColumnCount, scheduleIndex);
    setAlignedValue(aligned, indexes.period, leadingValues[0] ?? "");
    const sectionValues = leadingValues.slice(1);
    if (sectionValues.length >= 2) {
      setAlignedValue(aligned, indexes.block, sectionValues.at(-2) ?? "");
      setAlignedValue(aligned, indexes.blockDescription, sectionValues.at(-1) ?? "");
    } else {
      setAlignedValue(aligned, indexes.blockDescription, sectionValues[0] ?? "");
    }

    setAlignedValue(aligned, indexes.schedule, values[scheduleIndex] ?? "");
    setAlignedValue(aligned, indexes.capacity, values[scheduleIndex + 1] ?? "");
    const trailingValues = values.slice(scheduleIndex + 2);
    setAlignedValue(aligned, indexes.firstMonthCost, trailingValues.at(-1) ?? "");
    setAlignedValue(aligned, indexes.modality, trailingValues.at(-2) ?? "");
    setAlignedValue(aligned, indexes.prerequisiteCode, trailingValues.at(-3) ?? "");
    setAlignedValue(aligned, indexes.prerequisite, trailingValues.at(-4) ?? "");
    return aligned;
  }

  const missing = columnCount - values.length;
  return [
    ...values.slice(0, utilityColumnCount),
    ...Array.from({ length: missing }, () => ""),
    ...values.slice(utilityColumnCount),
  ];
}

function setAlignedValue(values: string[], index: number, value: string): void {
  if (index >= 0) values[index] = value;
}

function canonicalSectionIdentity(value: string): string {
  return normalizedText(value).replace(/\s+/g, "");
}

function mergeIfMissing(
  offering: MutableAcademicOffering,
  field: Exclude<OfferingField, "code" | "name" | "schedule">,
  value: string,
): void {
  if (value && !offering[field]) offering[field] = value;
}

function deduplicateOfferings(offerings: readonly AcademicOffering[]): AcademicOffering[] {
  const unique = new Map<string, AcademicOffering>();
  for (const offering of offerings) {
    const key = (Object.keys(HEADER_ALIASES) as OfferingField[])
      .map((field) => offering[field] ?? "")
      .concat(offering.schedules ?? [])
      .join("\u0000");
    if (!unique.has(key)) unique.set(key, offering);
  }
  return Array.from(unique.values());
}

function deduplicateLookupOptions(
  options: readonly AcademicOfferLookupOption[],
): AcademicOfferLookupOption[] {
  const unique = new Map<string, AcademicOfferLookupOption>();
  for (const option of options) {
    const key = `${option.code}\u0000${option.name}`;
    if (!unique.has(key)) unique.set(key, { ...option, index: unique.size });
  }
  return Array.from(unique.values());
}

function clickableOwner(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>("button, a, [role='button'], [tabindex], [ct='F4']") ?? element;
}
