import type { WebPaymentsModel } from "../core/types";
import { validatedWebPaymentsModel } from "./web-payments-bridge";

export const WEB_PAYMENTS_RUNTIME_UPSTREAM = "better-sirius:web-payments:frame:v1";
export const WEB_PAYMENTS_RUNTIME_DOWNSTREAM = "better-sirius:web-payments:top:v1";
export const WEB_PAYMENTS_RUNTIME_VALIDATE = "better-sirius:web-payments:validate:v1";
export const WEB_PAYMENTS_RUNTIME_PROBE = "better-sirius:web-payments:probe:v1";

type RuntimeListener = (
  message: unknown,
  sender: unknown,
  respond: (response: unknown) => void,
) => void;

interface ExtensionRuntime {
  readonly sendMessage: (message: unknown) => Promise<unknown> | void;
  readonly onMessage: {
    addListener(listener: RuntimeListener): void;
    removeListener(listener: RuntimeListener): void;
  };
}

function extensionRuntime(): ExtensionRuntime | undefined {
  return (globalThis as typeof globalThis & {
    chrome?: { runtime?: ExtensionRuntime };
  }).chrome?.runtime;
}

export function publishWebPaymentsRuntime(
  model: WebPaymentsModel,
): void {
  sendRuntimeMessage({ kind: WEB_PAYMENTS_RUNTIME_UPSTREAM, model });
}

export function validateWebPaymentsRuntimeSources(sources: readonly string[]): void {
  if (sources.length > 0) sendRuntimeMessage({ kind: WEB_PAYMENTS_RUNTIME_VALIDATE, sources });
}

export function listenForWebPaymentsRuntimeProbe(): void {
  extensionRuntime()?.onMessage.addListener((message, _sender, respond) => {
    if (isRecord(message) && message.kind === WEB_PAYMENTS_RUNTIME_PROBE) respond(true);
  });
}

function sendRuntimeMessage(message: unknown): void {
  try {
    const result = extensionRuntime()?.sendMessage(message);
    if (result && "catch" in result) void result.catch(() => undefined);
  } catch {
    return;
  }
}

export function listenForWebPaymentsRuntime(
  onModel: (source: string, model: WebPaymentsModel) => void,
): (() => void) | null {
  const runtime = extensionRuntime();
  if (!runtime) return null;
  const listener = (message: unknown): void => {
    if (!isRecord(message) || message.kind !== WEB_PAYMENTS_RUNTIME_DOWNSTREAM) return;
    if (typeof message.source !== "string" || !message.source) return;
    const model = validatedWebPaymentsModel(message.model);
    if (!model) return;
    onModel(message.source, model);
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
