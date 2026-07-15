import { APPLICATION_PATHS } from "../core/constants";
import type {
  ApplicationState,
  DetectedApplication,
  SupportedApplication,
} from "../core/types";
import { documentText, normalizedText } from "./text";

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

  const application =
    pathHint ??
    detectBySemantics(semanticSource);

  if (!application) return null;

  return {
    application,
    state: detectApplicationState(application, document, text),
    confidence: pathHint ? 1 : 0.78,
  };
}

function detectBySemantics(source: string): SupportedApplication | null {
  if (source.includes("calificaciones historicas") || source.includes("historial academico")) {
    return "historical-grades";
  }
  if (source.includes("oferta academica")) return "academic-offer";
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
  if (text.includes("error de aplicacion") || text.includes("web dynpro: error")) return "error";
  if (text.includes("sin resultados") || text.includes("no se encontraron")) return "empty";

  switch (application) {
    case "historical-grades": {
      const headers = tableHeaders(document);
      if (headers.some((header) => header.includes("creditos aprobados"))) return "results";
      if (text.includes("seleccione") && text.includes("programa")) return "initial";
      return "unknown";
    }
    case "academic-offer":
      if (document.querySelector("table tbody tr") && text.includes("seccion")) return "results";
      if (text.includes("codigo") && text.includes("buscar")) return "initial";
      return "unknown";
    case "registration":
      if (text.includes("seleccion del plan") || text.includes("continuar")) return "initial";
      return "unknown";
  }
}

function tableHeaders(document: Document): string[] {
  return Array.from(document.querySelectorAll("th")).map((header) => normalizedText(header.textContent));
}
