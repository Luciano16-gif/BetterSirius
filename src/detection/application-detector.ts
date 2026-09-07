import { APPLICATION_PATHS } from "../core/constants";
import type {
  ApplicationState,
  DetectedApplication,
  SupportedApplication,
} from "../core/types";
import { documentText, normalizedText } from "./text";
import { isSapErrorDocument } from "./portal-detector";

const APPLICATION_BY_PATH: ReadonlyArray<readonly [string, SupportedApplication]> = [
  [APPLICATION_PATHS.historicalGrades, "historical-grades"],
  [APPLICATION_PATHS.academicOffer, "academic-offer"],
  [APPLICATION_PATHS.registration, "registration"],
];

export function applicationFromUrl(value: string, base: string): SupportedApplication | null {
  try {
    const baseUrl = new URL(base);
    const candidate = new URL(value, baseUrl);
    if (candidate.origin !== baseUrl.origin) return null;
    const path = candidate.pathname.toLocaleLowerCase("en");
    return APPLICATION_BY_PATH.find(([knownPath]) => path.includes(knownPath))?.[1] ?? null;
  } catch {
    return null;
  }
}

export function detectApplication(
  document: Document,
  pathHint?: SupportedApplication | null,
): DetectedApplication | null {
  const text = documentText(document);
  const title = normalizedText(document.title);
  const semanticSource = `${title} ${text}`;

  const semanticApplication = detectBySemantics(semanticSource);
  const application = semanticApplication === "registration-window"
    ? semanticApplication
    : pathHint ?? semanticApplication;

  if (!application) return null;

  return {
    application,
    state: detectApplicationState(application, document, text),
    confidence: pathHint ? 1 : 0.78,
  };
}

function detectBySemantics(source: string): SupportedApplication | null {
  if (source.includes("web de pagos")
    && (source.includes("saldo total a la fecha")
      || source.includes("total de la deuda bolivares")
      || source.includes("no tiene pagos pendientes"))) return "web-payments";
  if (source.includes("turno de inscripcion")
    || (source.includes("fecha de inicio")
      && source.includes("fecha final")
      && source.includes("de hora")
      && source.includes("a hora"))) return "registration-window";
  if (source.includes("calificaciones historicas") || source.includes("historial academico")) {
    return "historical-grades";
  }
  if (source.includes("oferta academica")
    || source.includes("busqueda codigo de asignatura")
    || source.includes("busqueda: codigo de asignatura")
    || source.includes("nombre o codigo de la asignatura")) return "academic-offer";
  if (source.includes("inscripcion 2.0") || source.includes("seleccion del plan de estudio")) {
    return "registration";
  }
  return null;
}

function detectApplicationState(
  application: SupportedApplication,
  document: Document,
  text: string,
): ApplicationState {
  if (isSapErrorDocument(document)) return "error";
  if (text.includes("sin resultados") || text.includes("no se encontraron")) return "empty";

  switch (application) {
    case "historical-grades": {
      const headers = tableHeaders(document);
      if (headers.some((header) => header.includes("creditos aprobados"))) return "results";
      if (text.includes("seleccione") && text.includes("programa")) return "initial";
      return "unknown";
    }
    case "academic-offer":
      {
        const headers = tableHeaders(document);
        if (headers.some((header) => header === "codigo")
          && headers.some((header) => header === "asignatura")
          && headers.some((header) => header === "horario" || header === "cupo")) return "results";
      }
      if (text.includes("codigo") && text.includes("buscar")) return "initial";
      return "unknown";
    case "registration-window":
      if (text.includes("fecha de inicio")
        && text.includes("fecha final")
        && text.includes("de hora")
        && text.includes("a hora")) return "results";
      return "unknown";
    case "web-payments":
      if (text.includes("saldo total a la fecha")
        && text.includes("total dolares")
        && text.includes("total de la deuda bolivares")) return "results";
      return "unknown";
    case "registration":
      if (text.includes("seleccion del plan") || text.includes("continuar")) return "initial";
      return "unknown";
  }
}

function tableHeaders(document: Document): string[] {
  return Array.from(document.querySelectorAll("th")).map((header) => normalizedText(header.textContent));
}
