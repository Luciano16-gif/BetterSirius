import type { RegistrationWindowModel } from "../core/types";
import { normalizedText } from "../detection/text";

const DATE_PATTERN = "(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4})";
const TIME_PATTERN = "(\\d{1,2}:\\d{2}(?::\\d{2})?)";

export function readRegistrationWindow(document: Document): RegistrationWindowModel {
  const source = normalizedText(document.body?.textContent);
  const recognizable = source.includes("turno de inscripcion")
    || (source.includes("fecha de inicio") && source.includes("fecha final"));
  if (!recognizable) return { state: "unavailable" };

  const startDate = capture(source, `fecha de inicio\\s*:?\\s*${DATE_PATTERN}`);
  const endDate = capture(source, `fecha final\\s*:?\\s*${DATE_PATTERN}`);
  const startTime = capture(source, `de hora\\s*:?\\s*${TIME_PATTERN}`);
  const endTime = capture(source, `a hora\\s*:?\\s*${TIME_PATTERN}`);

  if (!startDate || !endDate || !startTime || !endTime) return { state: "unknown" };
  return { state: "results", startDate, startTime, endDate, endTime };
}

function capture(source: string, pattern: string): string | undefined {
  return new RegExp(pattern, "u").exec(source)?.[1];
}
