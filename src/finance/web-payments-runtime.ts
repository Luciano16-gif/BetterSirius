import type { WebPaymentsModel } from "../core/types";
import { validatedWebPaymentsModel } from "./web-payments-bridge";

export const WEB_PAYMENTS_RUNTIME_UPSTREAM = "better-sirius:web-payments:frame:v1";
export const WEB_PAYMENTS_RUNTIME_DOWNSTREAM = "better-sirius:web-payments:top:v1";

interface RuntimeMessage {
  readonly kind: string;
  readonly model: WebPaymentsModel;
}

interface ExtensionRuntime {
  readonly sendMessage: (message: RuntimeMessage) => Promise<unknown> | void;
  readonly onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
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
  try {
    const result = extensionRuntime()?.sendMessage({
      kind: WEB_PAYMENTS_RUNTIME_UPSTREAM,
      model,
    });
    if (result && "catch" in result) void result.catch(() => undefined);
  } catch {
    // The DOM bridge remains available when the extension runtime is being reloaded.
  }
}

export function listenForWebPaymentsRuntime(
  onModel: (model: WebPaymentsModel) => void,
): () => void {
  const runtime = extensionRuntime();
  if (!runtime) return () => undefined;
  const listener = (message: unknown): void => {
    if (!isRecord(message) || message.kind !== WEB_PAYMENTS_RUNTIME_DOWNSTREAM) return;
    const model = validatedWebPaymentsModel(message.model);
    if (!model) return;
    onModel(model);
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
