import {
  WEB_PAYMENTS_RUNTIME_DOWNSTREAM,
  WEB_PAYMENTS_RUNTIME_UPSTREAM,
  WEB_PAYMENTS_RUNTIME_VALIDATE,
  WEB_PAYMENTS_RUNTIME_PROBE,
} from "../finance/web-payments-runtime";
import { validatedWebPaymentsModel } from "../finance/web-payments-bridge";
import { isProntoPagoLocation, validateProntoPago } from "../finance/pronto-pago";
import { PRONTO_PAGO_DOWNSTREAM, PRONTO_PAGO_UPSTREAM } from "../finance/pronto-pago-runtime";
import { isAllowedRuntimeLocation } from "../safety/runtime-policy";

interface RuntimeSender {
  readonly frameId?: number;
  readonly documentId?: string;
  readonly url?: string;
  readonly tab?: { readonly id?: number; readonly url?: string };
}

interface BackgroundChrome {
  readonly runtime: {
    readonly onMessage: {
      addListener(listener: (message: unknown, sender: RuntimeSender) => void): void;
    };
  };
  readonly tabs: {
    sendMessage(
      tabId: number,
      message: unknown,
      options: { frameId: number } | { documentId: string },
    ): Promise<unknown> | void;
  };
}

const extensionChrome = (globalThis as typeof globalThis & { chrome: BackgroundChrome }).chrome;

extensionChrome.runtime.onMessage.addListener((message, sender) => {
  if (!isRecord(message) || !isSiriusTab(sender.tab?.url)) return;
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  if (message.kind === WEB_PAYMENTS_RUNTIME_VALIDATE && sender.frameId === 0) {
    if (!Array.isArray(message.sources) || message.sources.length > 250
      || !message.sources.every((source): source is string => typeof source === "string" && source.length > 0)) return;
    for (const source of new Set(message.sources)) void validateSource(tabId, source);
    return;
  }
  if (!sender.frameId) return;
  if (message.kind === WEB_PAYMENTS_RUNTIME_UPSTREAM) {
    if (!sender.documentId) return;
    const model = validatedWebPaymentsModel(message.model);
    if (model) relay(tabId, { kind: WEB_PAYMENTS_RUNTIME_DOWNSTREAM, source: sender.documentId, model });
  } else if (message.kind === PRONTO_PAGO_UPSTREAM && sender.documentId && isProntoPagoFrame(sender.url)) {
    const model = validateProntoPago(message.model);
    if (model) relay(tabId, { kind: PRONTO_PAGO_DOWNSTREAM, source: sender.documentId, model });
  }
});

async function validateSource(tabId: number, source: string): Promise<void> {
  let alive = false;
  try {
    alive = await extensionChrome.tabs.sendMessage(
      tabId,
      { kind: WEB_PAYMENTS_RUNTIME_PROBE },
      { documentId: source },
    ) === true;
  } catch {
    alive = false;
  }
  if (!alive) relay(tabId, { kind: WEB_PAYMENTS_RUNTIME_DOWNSTREAM, source, model: { state: "unavailable" } });
}

function relay(tabId: number, message: unknown): void {
  try {
    const result = extensionChrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    if (result && "catch" in result) void result.catch(() => undefined);
  } catch {
    // The top frame can disappear while SAP replaces its work area.
  }
}

function isSiriusTab(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return isAllowedRuntimeLocation(new URL(value));
  } catch {
    return false;
  }
}

function isProntoPagoFrame(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return isProntoPagoLocation(new URL(value));
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
