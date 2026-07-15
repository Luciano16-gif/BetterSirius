import type { ProgramSelectionResult } from "../academic/history";
import type { AcademicHistoryPeriod } from "../core/types";
import { normalizedText } from "../detection/text";

interface PeriodTarget {
  readonly activationElement: HTMLElement;
  readonly codeElement: HTMLElement;
  readonly labelElement: HTMLElement;
  readonly code: string;
  readonly label: string;
}

const INTERACTIVE_SELECTOR = [
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

export class HistoryPeriodController {
  readonly #rootDocument: Document;
  readonly #targets = new Map<number, PeriodTarget>();
  #nextToken = 1;

  constructor(rootDocument: Document) {
    this.#rootDocument = rootDocument;
  }

  discover(): readonly AcademicHistoryPeriod[] {
    this.#targets.clear();
    this.#nextToken = 1;

    for (const document of reachableDocuments(this.#rootDocument)) {
      for (const table of document.querySelectorAll<HTMLTableElement>("table")) {
        const periods = this.#readTable(table);
        if (periods.length > 0) return ensureActivePeriod(periods);
      }
    }
    return [];
  }

  activate(selection: AcademicHistoryPeriod): ProgramSelectionResult {
    const target = this.#targets.get(selection.index);
    if (!target) return "not-found";
    if (target.code !== selection.code || target.label !== selection.label) return "stale";
    if (
      !target.activationElement.isConnected ||
      cleanText(target.codeElement.textContent) !== target.code ||
      cleanText(target.labelElement.textContent) !== target.label
    ) return "stale";

    dispatchMouseActivation(target.activationElement);
    return "activated";
  }

  #readTable(table: HTMLTableElement): AcademicHistoryPeriod[] {
    const rows = directRows(table);
    const headerIndex = rows.findIndex((row) => {
      const headers = rowCells(row).map((cell) => canonicalHeader(cell.textContent));
      return findHeader(headers, ["codigo"]) >= 0 &&
        findHeader(headers, ["ano academico"]) >= 0 &&
        findHeader(headers, ["per acad", "periodo academico"]) >= 0;
    });
    if (headerIndex < 0) return [];

    const headers = rowCells(rows[headerIndex]!).map((cell) => canonicalHeader(cell.textContent));
    const codeIndex = findHeader(headers, ["codigo"]);
    const yearIndex = findHeader(headers, ["ano academico"]);
    const labelIndex = findHeader(headers, ["per acad", "periodo academico"]);

    return rows.slice(headerIndex + 1).flatMap((row): AcademicHistoryPeriod[] => {
      const cells = rowCells(row);
      const codeElement = cells[codeIndex];
      const yearElement = cells[yearIndex];
      const labelElement = cells[labelIndex];
      const code = cleanText(codeElement?.textContent);
      const academicYear = cleanText(yearElement?.textContent);
      const label = cleanText(labelElement?.textContent);
      if (!code || !academicYear || !label || !codeElement || !labelElement || !isVisible(row)) return [];

      const selectorCell = cells[0] ?? row;
      const activationElement = selectorCell.matches(INTERACTIVE_SELECTOR)
        ? selectorCell
        : selectorCell.querySelector<HTMLElement>(INTERACTIVE_SELECTOR) ?? selectorCell;
      const index = this.#nextToken++;
      this.#targets.set(index, { activationElement, codeElement, labelElement, code, label });
      return [{ index, code, academicYear, label, active: isSelectedRow(row, cells) }];
    });
  }
}

function ensureActivePeriod(periods: readonly AcademicHistoryPeriod[]): AcademicHistoryPeriod[] {
  if (periods.some((period) => period.active)) return Array.from(periods);
  return periods.map((period, index) => ({ ...period, active: index === 0 }));
}

function isSelectedRow(row: HTMLTableRowElement, cells: readonly HTMLElement[]): boolean {
  if (row.getAttribute("aria-selected") === "true" || row.dataset.selected === "true") return true;
  if ([row, ...cells].some((element) => /(^|\s)(selected|is-selected)(\s|$)/i.test(element.className))) return true;
  return cells.some((cell) => isSelectionOrange(cell.ownerDocument.defaultView?.getComputedStyle(cell).backgroundColor));
}

function isSelectionOrange(color: string | undefined): boolean {
  const values = color?.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!values || values.length < 3) return false;
  const [red = 0, green = 0, blue = 0] = values;
  return red >= 200 && green >= 70 && green <= 180 && blue <= 90;
}

function directRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).filter((row) => row.closest("table") === table);
}

function rowCells(row: HTMLTableRowElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>(":scope > th, :scope > td"));
}

function findHeader(headers: readonly string[], aliases: readonly string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => header === alias || header.startsWith(`${alias} `)));
}

function canonicalHeader(value: string | null | undefined): string {
  return normalizedText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
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
        // Cross-origin frames remain opaque.
      }
    }
  };
  visit(root);
  return documents;
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.closest("[hidden]")) return false;
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  if (view?.navigator.userAgent.includes("jsdom")) return true;
  const rectangle = element.getBoundingClientRect();
  return rectangle.width > 0 && rectangle.height > 0;
}
