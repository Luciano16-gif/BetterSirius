import { SIRIUS_ORIGIN } from "../core/constants";
import type { WebPaymentsModel } from "../core/types";
import { readWebPayments } from "./web-payments";

export const WEB_PAYMENTS_BRIDGE_KIND = "better-sirius:web-payments:v1";

export function startWebPaymentsFramePublisher(
  frameWindow: Window,
  document: Document,
  publishRuntime?: (model: WebPaymentsModel) => void,
): () => void {
  let publishScheduled = false;
  let lastPayload = "";
  let active = true;

  const send = (model: WebPaymentsModel): void => {
    frameWindow.top?.postMessage({ kind: WEB_PAYMENTS_BRIDGE_KIND, model }, SIRIUS_ORIGIN);
    publishRuntime?.(model);
  };

  const publish = (): void => {
    publishScheduled = false;
    if (!active) return;
    const model = readWebPayments(document);
    const serialized = JSON.stringify(model);
    if (serialized === lastPayload) return;
    lastPayload = serialized;
    send(model);
  };
  const schedulePublish = (): void => {
    if (!active || publishScheduled) return;
    publishScheduled = true;
    queueMicrotask(publish);
  };
  const observer = new MutationObserver(schedulePublish);
  const clear = (): void => {
    active = false;
    observer.disconnect();
    lastPayload = "";
    send({ state: "unavailable" });
  };
  const observe = (): void => {
    active = true;
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    schedulePublish();
  };
  frameWindow.addEventListener("pagehide", clear);
  frameWindow.addEventListener("pageshow", observe);
  observe();

  return () => {
    active = false;
    observer.disconnect();
    frameWindow.removeEventListener("pagehide", clear);
    frameWindow.removeEventListener("pageshow", observe);
  };
}

export function webPaymentsFromBridgeEvent(event: MessageEvent): WebPaymentsModel | null {
  if (!isSiriusFrameOrigin(event.origin) || !isRecord(event.data)) return null;
  if (event.data.kind !== WEB_PAYMENTS_BRIDGE_KIND || !isRecord(event.data.model)) return null;
  return validatedWebPaymentsModel(event.data.model);
}

export function validatedWebPaymentsModel(value: unknown): WebPaymentsModel | null {
  if (!isRecord(value)) return null;
  const model = value;
  if (model.state === "unavailable") return { state: "unavailable" };
  if (model.state !== "results" && model.state !== "unknown") return null;

  const rawMessageCount = model.messageCount;
  if (rawMessageCount !== undefined
    && (typeof rawMessageCount !== "number"
      || !Number.isSafeInteger(rawMessageCount)
      || rawMessageCount < 0)) return null;
  const messageCount = typeof rawMessageCount === "number" ? rawMessageCount : undefined;
  if (model.messageListAvailable !== undefined && typeof model.messageListAvailable !== "boolean") return null;
  if (model.noPendingPayments !== undefined && typeof model.noPendingPayments !== "boolean") return null;

  if (model.state === "unknown") {
    return {
      state: "unknown",
      ...(model.noPendingPayments === undefined ? {} : { noPendingPayments: model.noPendingPayments }),
      ...(messageCount === undefined ? {} : { messageCount }),
      ...(model.messageListAvailable === undefined
        ? {}
        : { messageListAvailable: model.messageListAvailable }),
    };
  }

  const amounts = [
    model.balanceAtDate,
    model.zellePayment,
    model.totalDollars,
    model.totalDebtBolivars,
  ];
  if (!amounts.every(isFormattedAmount)) return null;
  return {
    state: "results",
    balanceAtDate: model.balanceAtDate as string,
    zellePayment: model.zellePayment as string,
    totalDollars: model.totalDollars as string,
    totalDebtBolivars: model.totalDebtBolivars as string,
    ...(model.noPendingPayments === undefined ? {} : { noPendingPayments: model.noPendingPayments }),
    ...(messageCount === undefined ? {} : { messageCount }),
    ...(model.messageListAvailable === undefined
      ? {}
      : { messageListAvailable: model.messageListAvailable }),
  };
}

function isFormattedAmount(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+(?:\.\d{3})*,\d{2}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSiriusFrameOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    return origin.protocol === "http:" && origin.hostname === "sirius.unimet.edu.ve";
  } catch {
    return false;
  }
}
