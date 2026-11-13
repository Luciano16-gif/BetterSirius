import type { ProntoPagoLine, ProntoPagoStatement } from "../core/types";
import { normalizedText } from "../detection/text";

const statementHeading = "estado de cuenta pronto pago";
const columnLabels = ["fecha", "detalle del concepto", "monto usd"];
const usdPattern = /^\$ ?-?\d+(?:\.\d{3})*,\d{2}$/u;
const bsPattern = /^Bs\. ?-?\d+(?:\.\d{3})*,\d{2}$/iu;
const ratePattern = /^\d+(?:\.\d{3})*,\d{2} ?Bs\.$/iu;
const rateDatePattern = /^[\p{L}]+, ?\d{1,2} [\p{L}]+(?: de)? \d{4}$/iu;
const lineDatePattern = /^\d{2}\/\d{2}\/\d{4}$/u;
const maxLines = 250;

export function isProntoPagoLocation(location: Pick<Location, "origin" | "pathname">): boolean {
  return location.origin === "http://gapi2.unimet.edu.ve" && location.pathname === "/prontopago/cuenta.php";
}

export function readProntoPago(document: Document): ProntoPagoStatement {
  const heading = [...document.querySelectorAll("h1")]
    .find((candidate) => normalizedText(candidate.textContent) === statementHeading);
  if (!heading) return { state: "unavailable" };
  const statement = heading.closest(".card") ?? document.body;
  const table = [...statement.querySelectorAll("table")].find((candidate) => {
    const cells = candidate.rows[0]?.cells;
    return cells?.length === columnLabels.length
      && columnLabels.every((label, index) => normalizedText(cells[index]?.textContent) === label);
  });
  const labels = [...statement.querySelectorAll("small")];
  const field = (label: string): Element | null | undefined => labels
    .find((candidate) => normalizedText(candidate.textContent) === label)?.nextElementSibling;
  const rate = field("tasa bcv oficial");
  const exchangeDate = text(rate?.nextElementSibling);
  const lines = table && Array.from(table.rows).slice(1)
    .filter((row) => row.cells.length === columnLabels.length)
    .map((row) => ({
      date: text(row.cells[0]),
      concept: text(row.cells[1]),
      amountUsd: text(row.cells[2]),
      discount: row.classList.contains("is-desc"),
    }));
  return validateProntoPago({
    state: "results",
    lines,
    exchangeRate: text(rate),
    ...(rateDatePattern.test(exchangeDate) ? { exchangeDate } : {}),
    totalUsd: text(field("total usd")),
    totalBs: text(field("total bs")),
  }) ?? { state: "unknown" };
}

export function validateProntoPago(input: unknown): ProntoPagoStatement | null {
  if (!record(input)) return null;
  if (input.state === "unknown" || input.state === "unavailable") return { state: input.state };
  if (input.state !== "results"
    || !matches(input.totalUsd, usdPattern)
    || !matches(input.totalBs, bsPattern)
    || !matches(input.exchangeRate, ratePattern)
    || (input.exchangeDate !== undefined && !matches(input.exchangeDate, rateDatePattern))
    || !Array.isArray(input.lines) || input.lines.length > maxLines) return null;

  const lines: ProntoPagoLine[] = [];
  for (const line of input.lines) {
    if (!record(line) || !matches(line.date, lineDatePattern) || !matches(line.amountUsd, usdPattern)
      || typeof line.concept !== "string" || !line.concept.trim() || line.concept.length > 240
      || typeof line.discount !== "boolean") return null;
    lines.push({ date: line.date, concept: line.concept, amountUsd: line.amountUsd, discount: line.discount });
  }
  return {
    state: "results",
    lines,
    exchangeRate: input.exchangeRate,
    ...(input.exchangeDate === undefined ? {} : { exchangeDate: input.exchangeDate }),
    totalUsd: input.totalUsd,
    totalBs: input.totalBs,
  };
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function matches(input: unknown, pattern: RegExp): input is string {
  return typeof input === "string" && input.length <= 80 && pattern.test(input);
}

function record(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
