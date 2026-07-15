import type {
  AdapterError,
  ReadOnlyAction,
  ReadOnlyApplicationState,
  SapApplicationAdapter,
} from "./contracts";
import type { DetectionResult, SupportedApplication } from "../core/types";
import { detectApplication } from "../detection/application-detector";
import { documentText } from "../detection/text";

class PassiveAdapter implements SapApplicationAdapter<ReadOnlyApplicationState> {
  constructor(readonly application: SupportedApplication) {}

  detect(document: Document): DetectionResult<SupportedApplication> | null {
    const detection = detectApplication(document);
    return detection?.application === this.application
      ? {
          kind: this.application,
          confidence: detection.confidence,
          reason: "Known application path or stable semantic fingerprint matched.",
        }
      : null;
  }

  readState(document: Document): ReadOnlyApplicationState {
    return { state: detectApplication(document, this.application)?.state ?? "unknown" };
  }

  locateAction(_document: Document, _action: ReadOnlyAction): Element | null {
    // Deliberately inert in the MVP. No SAP control is delegated or activated.
    return null;
  }

  classifyError(document: Document): AdapterError | null {
    const text = documentText(document);
    if (text.includes("sesion ha expirado") || text.includes("session expired")) {
      return {
        kind: "session-expired",
        recoverable: true,
        message: "La sesión ya no está disponible. Usa la interfaz original para volver a ingresar.",
      };
    }
    if (text.includes("error de aplicacion") || text.includes("web dynpro: error")) {
      return {
        kind: "server-error",
        recoverable: false,
        message: "Sirius devolvió un error. BetterSirius no reintentará automáticamente.",
      };
    }
    return null;
  }
}

export const READ_ONLY_ADAPTERS: readonly SapApplicationAdapter<ReadOnlyApplicationState>[] = [
  new PassiveAdapter("historical-grades"),
  new PassiveAdapter("academic-offer"),
  new PassiveAdapter("registration"),
];
