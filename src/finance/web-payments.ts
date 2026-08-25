import type { WebPaymentsModel } from "../core/types";
import { normalizedText } from "../detection/text";

const AMOUNT_PATTERN = /-?\d+(?:[.\s]\d{3})*,\d{2}/u;
const VALUE_CONTAINERS = "td, th, span, p, strong, b, div, tr, section";

const LABELS = {
  balanceAtDate: "saldo total a la fecha",
  zellePayment: "pago en zelle",
  totalDollars: "total dolares",
  totalDebtBolivars: "total de la deuda bolivares",
} as const;

export function readWebPayments(document: Document): WebPaymentsModel {
  const documents = reachableDocuments(document);
  const source = documents
    .map((current) => normalizedText(current.body?.textContent))
    .join(" ");
  const recognizable = source.includes("web de pagos")
    || source.includes(LABELS.balanceAtDate)
    || source.includes(LABELS.totalDebtBolivars);
  if (!recognizable) return { state: "unavailable" };

  const balanceAtDate = findLabeledAmount(documents, LABELS.balanceAtDate);
  const zellePayment = findLabeledAmount(documents, LABELS.zellePayment);
  const totalDollars = findLabeledAmount(documents, LABELS.totalDollars);
  const totalDebtBolivars = findLabeledAmount(documents, LABELS.totalDebtBolivars);
  const messageCount = findMessageCount(documents);
  const messageListAvailable = documents.some((current) =>
    Array.from(current.querySelectorAll("a, button, [role='button'], [onclick]"))
      .some((element) => normalizedText(element.textContent) === "visualizar lista"),
  );

  if (!balanceAtDate || !zellePayment || !totalDollars || !totalDebtBolivars) {
    return {
      state: "unknown",
      noPendingPayments: source.includes("no tiene pagos pendientes"),
      ...(messageCount === undefined ? {} : { messageCount }),
      messageListAvailable,
    };
  }

  return {
    state: "results",
    balanceAtDate,
    zellePayment,
    totalDollars,
    totalDebtBolivars,
    noPendingPayments: source.includes("no tiene pagos pendientes"),
    ...(messageCount === undefined ? {} : { messageCount }),
    messageListAvailable,
  };
}

function findLabeledAmount(documents: readonly Document[], label: string): string | undefined {
  const candidates = documents.flatMap((document) =>
    Array.from(document.querySelectorAll<HTMLElement>(VALUE_CONTAINERS)),
  ).flatMap((element) => nearbyTexts(element, label))
    .filter((text, index, all) => all.indexOf(text) === index)
    .sort((left, right) => left.length - right.length);

  for (const text of candidates) {
    const remainder = text.slice(text.indexOf(label) + label.length);
    const amount = AMOUNT_PATTERN.exec(remainder)?.[0];
    if (amount) return amount.replace(/\s+/g, "");
  }
  return undefined;
}

function nearbyTexts(element: HTMLElement, label: string): string[] {
  const texts: string[] = [];
  const add = (candidate: Element | null): void => {
    if (!candidate) return;
    const text = normalizedText(candidate.textContent);
    if (text.includes(label)) texts.push(text);
  };

  add(element);
  add(element.closest("tr"));
  add(element.closest("td"));

  let ancestor: Element | null = element.parentElement;
  for (let depth = 0; ancestor && depth < 5; depth += 1) {
    add(ancestor);
    ancestor = ancestor.parentElement;
  }

  return texts;
}

function findMessageCount(documents: readonly Document[]): number | undefined {
  const candidates = documents.flatMap((document) =>
    Array.from(document.querySelectorAll<HTMLElement>(VALUE_CONTAINERS)),
  ).map((element) => normalizedText(element.textContent))
    .filter((text) => /\b\d+\s+mensajes?\b/u.test(text))
    .sort((left, right) => left.length - right.length);
  const value = /\b(\d+)\s+mensajes?\b/u.exec(candidates[0] ?? "")?.[1];
  if (!value) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : undefined;
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
        // Cross-origin frames are intentionally opaque.
      }
    }
  };
  visit(root);
  return documents;
}
