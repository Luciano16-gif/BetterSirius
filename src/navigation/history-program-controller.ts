import type { ProgramSelection, ProgramSelectionResult } from "../academic/history";
import type { AcademicHistoryProgram } from "../core/types";
import { normalizedText } from "../detection/text";

type ProgramTarget =
  | {
      readonly kind: "option";
      readonly element: HTMLElement;
      readonly labelElement: HTMLElement;
      readonly label: string;
    }
  | { readonly kind: "select"; readonly element: HTMLSelectElement; readonly optionIndex: number; readonly label: string };

interface ProgramTableRow {
  readonly activationElement: HTMLElement;
  readonly labelElement: HTMLElement;
  readonly label: string;
}

const OPTION_SELECTOR = [
  "[role='option']",
  "[role='listbox'] *",
  "[lsevents]",
  "[onclick]",
  "li",
  "td",
  "div",
  "span",
  "a",
].join(",");

const INTERACTIVE_CELL_SELECTOR = [
  "[role='radio']",
  "[aria-selected]",
  "[lsevents]",
  "[onclick]",
  "[onmousedown]",
  "[onmouseup]",
  "[lsdata]",
  "a",
  "button",
  "input",
].join(",");

export class HistoryProgramController {
  readonly #rootDocument: Document;
  readonly #targets = new Map<number, ProgramTarget>();
  #nextToken = 1;
  #withdrawnControl: HTMLElement | null = null;
  #withdrawnEnabled = false;

  constructor(rootDocument: Document) {
    this.#rootDocument = rootDocument;
  }

  async discover(): Promise<readonly AcademicHistoryProgram[]> {
    this.#targets.clear();
    this.#nextToken = 1;
    const documents = reachableDocuments(this.#rootDocument);
    const withdrawnControl = findWithdrawnControl(documents);
    if (withdrawnControl !== this.#withdrawnControl) {
      this.#withdrawnControl = withdrawnControl;
      this.#withdrawnEnabled = knownCheckedState(withdrawnControl) ?? false;
    }
    const native = findProgramSelect(documents);
    if (native) return this.#registerNativeOptions(native);

    const rows = findProgramTableRows(documents);
    if (rows.length > 0) return rows.map((row) => this.#registerProgramRow(row));

    const control = findProgramDropDown(documents);
    if (!control) return [];
    const visibleBefore = new Set(visibleOptionCandidates(documents));
    control.click();
    const options = await waitForOptions(this.#rootDocument, visibleBefore);
    return options.map((element) => this.#registerOption(element));
  }

  activate(selection: ProgramSelection): ProgramSelectionResult {
    const target = this.#targets.get(selection.index);
    if (!target) return "not-found";
    if (target.label !== selection.label) return "stale";

    if (target.kind === "select") {
      const currentLabel = cleanText(target.element.options.item(target.optionIndex)?.textContent);
      if (!target.element.isConnected || currentLabel !== target.label) return "stale";
      target.element.selectedIndex = target.optionIndex;
      dispatchSelectionEvents(target.element);
      return "activated";
    }

    if (
      !target.element.isConnected ||
      !target.labelElement.isConnected ||
      cleanText(target.labelElement.textContent) !== target.label
    ) return "stale";
    dispatchMouseActivation(target.element);
    return "activated";
  }

  setWithdrawnCourses(enabled: boolean): ProgramSelectionResult {
    const control = findWithdrawnControl(reachableDocuments(this.#rootDocument));
    if (!control || !control.isConnected) return "not-found";
    this.#withdrawnControl = control;

    const knownState = knownCheckedState(control);
    const current = knownState ?? this.#withdrawnEnabled;
    if (current === enabled) return "activated";
    dispatchMouseActivation(control);
    this.#withdrawnEnabled = enabled;
    return "activated";
  }

  #registerNativeOptions(select: HTMLSelectElement): AcademicHistoryProgram[] {
    return Array.from(select.options).flatMap((option, optionIndex) => {
      const label = cleanText(option.textContent);
      if (!isProgramChoice(label) || option.disabled) return [];
      const index = this.#nextToken++;
      this.#targets.set(index, { kind: "select", element: select, optionIndex, label });
      return [{ index, label }];
    });
  }

  #registerOption(element: HTMLElement): AcademicHistoryProgram {
    const label = cleanText(element.textContent);
    const index = this.#nextToken++;
    this.#targets.set(index, { kind: "option", element, labelElement: element, label });
    return { index, label };
  }

  #registerProgramRow(row: ProgramTableRow): AcademicHistoryProgram {
    const index = this.#nextToken++;
    this.#targets.set(index, {
      kind: "option",
      element: row.activationElement,
      labelElement: row.labelElement,
      label: row.label,
    });
    return { index, label: row.label };
  }
}

function findWithdrawnControl(documents: readonly Document[]): HTMLElement | null {
  for (const document of documents) {
    const native = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
      .find((input) => normalizedText([
        input.labels ? Array.from(input.labels).map((label) => label.textContent).join(" ") : "",
        input.getAttribute("aria-label"),
        input.closest("label")?.textContent,
      ].join(" ")).includes("materias retiradas"));
    if (native) return native;

    const aria = Array.from(document.querySelectorAll<HTMLElement>("[role='checkbox']"))
      .find((element) => normalizedText([
        element.textContent,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
      ].join(" ")).includes("materias retiradas"));
    if (aria) return aria;

    const prompts = Array.from(document.querySelectorAll<HTMLElement>("label,span,td,div"))
      .filter((element) =>
        normalizedText(element.textContent) === "mostrar materias retiradas" &&
        !Array.from(element.children).some(
          (child) => normalizedText(child.textContent) === "mostrar materias retiradas",
        ),
      );
    for (const prompt of prompts) {
      const parent = prompt.parentElement;
      const candidate = parent?.querySelector<HTMLElement>(
        "input[type='checkbox'],[role='checkbox'],[id$='-img'],img,[lsevents],[lsdata]",
      ) ?? prompt.closest<HTMLElement>("[lsevents],[lsdata]") ?? parent;
      if (candidate && isVisible(candidate)) return candidate;
    }
  }
  return null;
}

function knownCheckedState(control: HTMLElement | null): boolean | null {
  if (!control) return null;
  if (control instanceof HTMLInputElement && control.type === "checkbox") return control.checked;
  const ariaChecked = control.getAttribute("aria-checked");
  if (ariaChecked === "true") return true;
  if (ariaChecked === "false") return false;
  return null;
}

function findProgramTableRows(documents: readonly Document[]): ProgramTableRow[] {
  for (const document of documents) {
    const pageText = normalizedText(document.body?.textContent);
    if (!pageText.includes("programas academicos") || !pageText.includes("seleccione un programa")) continue;

    for (const table of document.querySelectorAll<HTMLTableElement>("table")) {
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"));
      const headerIndex = rows.findIndex((row) => {
        const headers = rowCells(row).map((cell) => canonicalHeader(cell.textContent));
        return findHeader(headers, "codigo") >= 0 && findHeader(headers, "descripcion") >= 0;
      });
      if (headerIndex < 0) continue;

      const headers = rowCells(rows[headerIndex]!).map((cell) => canonicalHeader(cell.textContent));
      const codeIndex = findHeader(headers, "codigo");
      const descriptionIndex = findHeader(headers, "descripcion");
      const programs = rows.slice(headerIndex + 1).flatMap((row): ProgramTableRow[] => {
        const cells = rowCells(row);
        const code = cleanText(cells[codeIndex]?.textContent);
        const labelElement = cells[descriptionIndex];
        const label = cleanText(labelElement?.textContent);
        if (!code || !label || !labelElement || !isVisible(row)) return [];

        const selectorCell = cells[0] ?? row;
        const activationElement = selectorCell.matches(INTERACTIVE_CELL_SELECTOR)
          ? selectorCell
          : selectorCell.querySelector<HTMLElement>(INTERACTIVE_CELL_SELECTOR) ?? selectorCell;
        return [{ activationElement, labelElement, label }];
      });
      if (programs.length > 0) return programs;
    }
  }
  return [];
}

function findProgramSelect(documents: readonly Document[]): HTMLSelectElement | null {
  const selects = documents
    .flatMap((document) => Array.from(document.querySelectorAll("select")))
    .filter(isVisible);
  return selects.find((select) => controlLabel(select).includes("programa")) ??
    (selects.length === 1 ? selects[0]! : null);
}

function findProgramDropDown(documents: readonly Document[]): HTMLElement | null {
  const nearbyCandidates: HTMLElement[] = [];
  for (const document of documents) {
    const prompts = Array.from(document.querySelectorAll<HTMLElement>("label,span,td,div,[aria-label],[title]"))
      .filter(isProgramPrompt);
    for (const prompt of prompts) {
      const associated = associatedControl(prompt);
      if (associated) nearbyCandidates.push(associated);
      const container = prompt.closest<HTMLElement>("tr,td,fieldset,div") ?? prompt.parentElement;
      if (!container) continue;
      nearbyCandidates.push(...Array.from(container.querySelectorAll<HTMLElement>(
        "[role='combobox'], [aria-haspopup='listbox'], button, input, select, [lsevents], [lsdata]",
      )).filter((element) => element !== prompt && !prompt.contains(element)));
    }
  }

  const rankedNearby = unique(nearbyCandidates)
    .filter(isInteractiveDropDown)
    .sort((left, right) => dropDownScore(right) - dropDownScore(left));
  if (rankedNearby[0]) return rankedNearby[0];

  const globalCandidates = documents.flatMap((document) => Array.from(document.querySelectorAll<HTMLElement>(
    "[role='combobox'], [aria-haspopup='listbox'], [lsevents]",
  ))).filter(isStrongDropDownCandidate);
  return unique(globalCandidates).length === 1 ? globalCandidates[0]! : null;
}

function isProgramPrompt(element: HTMLElement): boolean {
  const source = normalizedText([
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
  ].join(" "));
  return source.includes("programa") && source.length <= 180;
}

function associatedControl(prompt: HTMLElement): HTMLElement | null {
  if (!(prompt instanceof HTMLLabelElement) || !prompt.htmlFor) return null;
  return prompt.ownerDocument.getElementById(prompt.htmlFor);
}

function isInteractiveDropDown(element: HTMLElement): boolean {
  if (!isVisible(element)) return false;
  if (element.matches("[role='combobox'], [aria-haspopup='listbox']")) return true;
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) return true;
  return element.hasAttribute("lsevents");
}

function isStrongDropDownCandidate(element: HTMLElement): boolean {
  if (!isVisible(element)) return false;
  if (element.matches("[role='combobox'], [aria-haspopup='listbox']")) return true;
  return element.hasAttribute("lsevents") && Boolean(element.querySelector("input,button") ?? element.closest("button"));
}

function dropDownScore(element: HTMLElement): number {
  let score = renderedArea(element);
  if (element.matches("[role='combobox']")) score += 1_000_000;
  if (element.matches("[aria-haspopup='listbox']")) score += 500_000;
  if (element.hasAttribute("lsevents")) score += 100_000;
  return score;
}

async function waitForOptions(rootDocument: Document, visibleBefore: ReadonlySet<HTMLElement>): Promise<HTMLElement[]> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const candidates = visibleOptionCandidates(reachableDocuments(rootDocument))
      .filter((element) => !visibleBefore.has(element));
    if (candidates.length > 0) return candidates;
  }
  return [];
}

function visibleOptionCandidates(documents: readonly Document[]): HTMLElement[] {
  const candidates = documents.flatMap((document) =>
    Array.from(document.querySelectorAll<HTMLElement>(OPTION_SELECTOR)),
  );
  const byLabel = new Map<string, HTMLElement>();
  for (const element of unique(candidates)) {
    const label = cleanText(element.textContent);
    if (!isVisible(element) || !isOptionShape(element) || !isProgramChoice(label)) continue;
    const current = byLabel.get(label);
    if (!current || optionScore(element) > optionScore(current)) byLabel.set(label, element);
  }
  return Array.from(byLabel.values());
}

function isOptionShape(element: HTMLElement): boolean {
  if (element.getAttribute("role") === "listbox") return false;
  if (element.getAttribute("role") === "option") return true;
  if (element.querySelectorAll("[role='option']").length > 0) return false;
  const interactiveDescendants = element.querySelectorAll("[lsevents],[onclick],a,button");
  return interactiveDescendants.length === 0 || element.hasAttribute("lsevents") || element.hasAttribute("onclick");
}

function optionScore(element: HTMLElement): number {
  let score = 0;
  if (element.getAttribute("role") === "option") score += 1_000;
  if (element.hasAttribute("lsevents")) score += 800;
  if (element.hasAttribute("onclick")) score += 700;
  if (element.matches("a,li,td")) score += 300;
  score += Math.min(100, element.children.length);
  return score;
}

function isProgramChoice(label: string): boolean {
  const normalized = normalizedText(label);
  return label.length > 0 && label.length <= 180 &&
    !normalized.includes("seleccione") &&
    !["aceptar", "cancelar", "cerrar", "buscar"].includes(normalized);
}

function rowCells(row: HTMLTableRowElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>(":scope > th, :scope > td"));
}

function findHeader(headers: readonly string[], expected: string): number {
  return headers.findIndex((header) => header === expected || header.startsWith(`${expected} `));
}

function canonicalHeader(value: string | null | undefined): string {
  return normalizedText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function controlLabel(element: HTMLSelectElement): string {
  const labels = element.labels ? Array.from(element.labels).map((label) => label.textContent) : [];
  return [...labels, element.getAttribute("aria-label"), element.getAttribute("title"), element.closest("label")?.textContent]
    .map(normalizedText)
    .join(" ");
}

function dispatchSelectionEvents(select: HTMLSelectElement): void {
  const EventConstructor = select.ownerDocument.defaultView?.Event ?? Event;
  select.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  select.dispatchEvent(new EventConstructor("change", { bubbles: true }));
}

function dispatchMouseActivation(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  const MouseEventConstructor = view?.MouseEvent ?? MouseEvent;
  for (const type of ["mousedown", "mouseup", "click"] as const) {
    element.dispatchEvent(new MouseEventConstructor(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "mousedown" ? 1 : 0,
    }));
  }
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
        if (frame.contentDocument) visit(frame.contentDocument);
      } catch {
        // Cross-origin frames stay opaque.
      }
    }
  };
  visit(root);
  return documents;
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.closest("[hidden]")) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  if (element.ownerDocument.defaultView?.navigator.userAgent.includes("jsdom")) return true;
  return renderedArea(element) > 0;
}

function renderedArea(element: Element): number {
  const rectangle = element.getBoundingClientRect();
  return Math.max(0, rectangle.width) * Math.max(0, rectangle.height);
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
