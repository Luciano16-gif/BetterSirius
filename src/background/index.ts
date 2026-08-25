import {
  WEB_PAYMENTS_RUNTIME_DOWNSTREAM,
  WEB_PAYMENTS_RUNTIME_UPSTREAM,
} from "../finance/web-payments-runtime";
import { validatedWebPaymentsModel } from "../finance/web-payments-bridge";

interface RuntimeSender {
  readonly frameId?: number;
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
      options: { frameId: number },
    ): Promise<unknown> | void;
  };
}

const extensionChrome = (globalThis as typeof globalThis & { chrome: BackgroundChrome }).chrome;

extensionChrome.runtime.onMessage.addListener((message, sender) => {
  if (!isRecord(message) || message.kind !== WEB_PAYMENTS_RUNTIME_UPSTREAM) return;
  if (!isSiriusTab(sender.tab?.url) || sender.frameId === 0) return;
  const tabId = sender.tab?.id;
  const model = validatedWebPaymentsModel(message.model);
  if (tabId === undefined || !model) return;
  try {
    const result = extensionChrome.tabs.sendMessage(
      tabId,
      { kind: WEB_PAYMENTS_RUNTIME_DOWNSTREAM, model },
      { frameId: 0 },
    );
    if (result && "catch" in result) void result.catch(() => undefined);
  } catch {
    // The top frame can disappear while SAP replaces its work area.
  }
});

function isSiriusTab(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.hostname === "sirius.unimet.edu.ve";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
