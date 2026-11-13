import type { ProntoPagoStatement } from "../core/types";
import { isProntoPagoLocation, readProntoPago, validateProntoPago } from "./pronto-pago";

export const PRONTO_PAGO_UPSTREAM = "better-sirius:pronto-pago:frame";
export const PRONTO_PAGO_DOWNSTREAM = "better-sirius:pronto-pago:top";

interface Runtime {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
  };
}

function getRuntime(): Runtime | undefined {
  return (globalThis as typeof globalThis & { chrome?: { runtime?: Runtime } }).chrome?.runtime;
}

export function publishProntoPagoStatement(window: Window): void {
  if (window === window.top || !isProntoPagoLocation(window.location)) return;
  const runtime = getRuntime();
  if (!runtime) return;
  const document = window.document;
  const send = (model: ProntoPagoStatement): void => {
    try {
      void runtime.sendMessage({ kind: PRONTO_PAGO_UPSTREAM, model }).catch(() => undefined);
    } catch {
      return;
    }
  };
  let signature = "";
  const publish = (): void => {
    const model = readProntoPago(document);
    const next = JSON.stringify(model);
    if (signature === next) return;
    signature = next;
    send(model);
  };
  const observer = new MutationObserver(publish);
  const observe = (): void => {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    publish();
  };
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    signature = "";
    send({ state: "unavailable" });
  });
  window.addEventListener("pageshow", observe);
  observe();
}

export function listenForProntoPago(
  onStatement: (source: string, statement: ProntoPagoStatement) => void,
): () => void {
  const runtime = getRuntime();
  if (!runtime) return () => undefined;
  const listener = (message: unknown): void => {
    if (typeof message !== "object" || message === null) return;
    const { kind, model, source } = message as Record<string, unknown>;
    if (kind !== PRONTO_PAGO_DOWNSTREAM || typeof source !== "string") return;
    const statement = validateProntoPago(model);
    if (statement) onStatement(source, statement);
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}
