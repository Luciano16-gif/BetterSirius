import { normalizedText } from "../detection/text";

export type ReadOnlyNavigationResult = "activated" | "not-found" | "ambiguous" | "busy";

const HISTORICAL_GRADES_PATH = [
  "Procesos Académicos",
  "Pregrado",
  "Consultas y Solicitudes",
  "Consulta Calificaciones Históricas",
] as const;

const PERIOD_GRADES_PATH = [
  "Procesos Académicos",
  "Pregrado",
  "Consultas y Solicitudes",
  "Consulta de Calificaciones Período",
] as const;

const CLICKABLE_SELECTOR = "a, button, [role='menuitem'], [role='link'], [onclick]";

export class AcademicNavigator {
  readonly #rootDocument: Document;
  #busy = false;

  constructor(rootDocument: Document) {
    this.#rootDocument = rootDocument;
  }

  async openHistoricalGrades(): Promise<ReadOnlyNavigationResult> {
    return this.#openPath(HISTORICAL_GRADES_PATH);
  }

  async openPeriodGrades(): Promise<ReadOnlyNavigationResult> {
    return this.#openPath(PERIOD_GRADES_PATH);
  }

  async #openPath(path: readonly string[]): Promise<ReadOnlyNavigationResult> {
    if (this.#busy) return "busy";
    this.#busy = true;
    try {
      for (let actionCount = 0; actionCount < path.length; actionCount += 1) {
        const match = deepestAvailableMatch(this.#rootDocument, path);
        if (match.kind === "ambiguous") return "ambiguous";
        if (match.kind === "missing") return "not-found";

        match.element.click();
        if (match.index === path.length - 1) return "activated";

        const appeared = await waitForDeeperStep(
          this.#rootDocument,
          path,
          match.index,
        );
        if (!appeared) return "not-found";
      }
      return "not-found";
    } finally {
      this.#busy = false;
    }
  }
}

type MatchResult =
  | { readonly kind: "found"; readonly element: HTMLElement; readonly index: number }
  | { readonly kind: "missing" }
  | { readonly kind: "ambiguous" };

function deepestAvailableMatch(
  rootDocument: Document,
  path: readonly string[],
  afterIndex = -1,
): MatchResult {
  for (let index = path.length - 1; index > afterIndex; index -= 1) {
    const matches = findExactClickableElements(rootDocument, path[index]!);
    if (matches.length > 0) return { kind: "found", element: matches[0]!.element, index };
  }
  return { kind: "missing" };
}

interface RankedClickable {
  readonly element: HTMLElement;
  readonly depth: number;
  readonly renderedArea: number;
  readonly order: number;
}

function findExactClickableElements(rootDocument: Document, label: string): RankedClickable[] {
  const expected = normalizedText(label);
  const matches: RankedClickable[] = [];
  let order = 0;
  for (const entry of accessibleDocuments(rootDocument)) {
    for (const candidate of entry.document.querySelectorAll<HTMLElement>(CLICKABLE_SELECTOR)) {
      if (normalizedText(candidate.textContent) !== expected || !isVisible(candidate)) continue;
      const rectangle = candidate.getBoundingClientRect();
      matches.push({
        element: candidate,
        depth: entry.depth,
        renderedArea: Math.max(0, rectangle.width * rectangle.height),
        order,
      });
      order += 1;
    }
  }
  return matches.sort((left, right) =>
    Number(right.renderedArea > 0) - Number(left.renderedArea > 0)
      || right.depth - left.depth
      || right.renderedArea - left.renderedArea
      || left.order - right.order,
  );
}

interface AccessibleDocument {
  readonly document: Document;
  readonly depth: number;
}

function accessibleDocuments(rootDocument: Document): AccessibleDocument[] {
  const documents: AccessibleDocument[] = [];
  const visited = new Set<Document>();
  const visit = (document: Document, depth: number): void => {
    if (visited.has(document)) return;
    visited.add(document);
    documents.push({ document, depth });
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        if (!isVisible(frame) || (!isJsdom(document) && frame.getClientRects().length === 0)) continue;
        if (frame.contentDocument) visit(frame.contentDocument, depth + 1);
      } catch {
        // Cross-origin frames are never inspected or navigated.
      }
    }
  };
  visit(rootDocument, 0);
  return documents;
}

function isJsdom(document: Document): boolean {
  return document.defaultView?.navigator.userAgent.toLocaleLowerCase("en").includes("jsdom") ?? false;
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

function waitForDeeperStep(
  rootDocument: Document,
  path: readonly string[],
  afterIndex: number,
): Promise<boolean> {
  if (deepestAvailableMatch(rootDocument, path, afterIndex).kind !== "missing") {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const observers: MutationObserver[] = [];
    const loadTargets: HTMLIFrameElement[] = [];
    let settled = false;

    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      for (const observer of observers) observer.disconnect();
      for (const frame of loadTargets) frame.removeEventListener("load", check);
      clearTimeout(timeout);
      resolve(result);
    };
    const check = (): void => {
      const match = deepestAvailableMatch(rootDocument, path, afterIndex);
      if (match.kind !== "missing") finish(true);
    };

    for (const entry of accessibleDocuments(rootDocument)) {
      const document = entry.document;
      if (document.documentElement) {
        const observer = new MutationObserver(check);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        observers.push(observer);
      }
      for (const frame of document.querySelectorAll("iframe")) {
        frame.addEventListener("load", check);
        loadTargets.push(frame);
      }
    }
    const timeout = setTimeout(() => finish(false), 8_000);
    check();
  });
}
