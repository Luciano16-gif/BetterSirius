import type { DetectionResult, PortalSurface } from "../core/types";
import { documentText, normalizedText } from "./text";

const SESSION_EXPIRED_PATTERNS = [
  "sesion ha expirado",
  "sesion expirada",
  "session expired",
  "inicie sesion nuevamente",
] as const;

const SAP_ERROR_PATTERNS = [
  "500 internal server error",
  "web dynpro: error",
  "error de aplicacion",
  "application error",
] as const;

const PORTAL_PATTERNS = [
  "procesos academicos",
  "procesos administrativos",
  "informacion de interes",
] as const;

export function detectPortalSurface(document: Document): DetectionResult<PortalSurface> {
  const text = documentText(document);
  const title = normalizedText(document.title);

  if (SESSION_EXPIRED_PATTERNS.some((pattern) => text.includes(pattern))) {
    return { kind: "session-expired", confidence: 1, reason: "Semantic session-expiry message found." };
  }

  if (SAP_ERROR_PATTERNS.some((pattern) => text.includes(pattern) || title.includes(pattern))) {
    return { kind: "sap-error", confidence: 0.98, reason: "Semantic SAP error message found." };
  }

  const hasPasswordField = document.querySelector('input[type="password"]') !== null;
  const hasLoginForm = hasPasswordField && document.querySelector("form") !== null;
  if (hasLoginForm) {
    return { kind: "login", confidence: 0.95, reason: "A login form with a password input is present." };
  }

  const portalSignals = PORTAL_PATTERNS.filter((pattern) => text.includes(pattern)).length;
  const hasFrames = document.querySelector("iframe") !== null;
  if (portalSignals >= 2 || (portalSignals >= 1 && hasFrames)) {
    return { kind: "portal-shell", confidence: 0.92, reason: "Portal headings and frame structure found." };
  }

  return { kind: "unsupported", confidence: 0, reason: "No supported Sirius surface was identified." };
}

