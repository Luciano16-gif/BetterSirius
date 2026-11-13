import { describe, expect, it, vi } from "vitest";
import { SIRIUS_ORIGIN } from "../src/core/constants";
import {
  WEB_PAYMENTS_BRIDGE_KIND,
  startWebPaymentsFramePublisher,
  webPaymentsFromBridgeEvent,
} from "../src/finance/web-payments-bridge";
import { fixtureDocument } from "./helpers/fixture";

const syntheticModel = {
  state: "results",
  balanceAtDate: "125,00",
  zellePayment: "25,00",
  totalDollars: "100,00",
  totalDebtBolivars: "9.999,99",
  noPendingPayments: true,
  messageCount: 2,
  messageListAvailable: true,
} as const;

describe("Web de Pagos frame bridge", () => {
  it("publishes only the normalized allowlisted model to the Sirius parent", async () => {
    const postMessage = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const frameWindow = {
      top: { postMessage },
      addEventListener,
      removeEventListener,
    } as unknown as Window;

    const dispose = startWebPaymentsFramePublisher(
      frameWindow,
      fixtureDocument("web-payments-results.html"),
    );
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledWith(
      { kind: WEB_PAYMENTS_BRIDGE_KIND, model: syntheticModel },
      SIRIUS_ORIGIN,
    );
    dispose();
  });

  it("accepts a valid same-origin financial summary", () => {
    const event = new MessageEvent("message", {
      origin: SIRIUS_ORIGIN,
      data: { kind: WEB_PAYMENTS_BRIDGE_KIND, model: syntheticModel },
    });
    expect(webPaymentsFromBridgeEvent(event)).toEqual(syntheticModel);
  });

  it("clears both transports and republishes unchanged values after every restore", async () => {
    const frameWindow = new EventTarget();
    const postMessage = vi.fn();
    Object.assign(frameWindow, { top: { postMessage } });
    const publishRuntime = vi.fn();
    const document = fixtureDocument("web-payments-results.html");
    const dispose = startWebPaymentsFramePublisher(frameWindow as unknown as Window, document, publishRuntime);
    await Promise.resolve();

    for (let cycle = 0; cycle < 2; cycle += 1) {
      frameWindow.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      expect(publishRuntime).toHaveBeenLastCalledWith({ state: "unavailable" });
      expect(postMessage).toHaveBeenLastCalledWith(
        { kind: WEB_PAYMENTS_BRIDGE_KIND, model: { state: "unavailable" } },
        SIRIUS_ORIGIN,
      );
      frameWindow.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      await Promise.resolve();
      expect(publishRuntime).toHaveBeenLastCalledWith(syntheticModel);
    }

    dispose();
    const calls = publishRuntime.mock.calls.length;
    document.querySelector("section p strong")!.textContent = "200,00";
    await Promise.resolve();
    expect(publishRuntime).toHaveBeenCalledTimes(calls);
  });

  it("does not publish queued results after the frame has been hidden", async () => {
    const frameWindow = new EventTarget();
    Object.assign(frameWindow, { top: { postMessage: vi.fn() } });
    const publishRuntime = vi.fn();
    const dispose = startWebPaymentsFramePublisher(
      frameWindow as unknown as Window,
      fixtureDocument("web-payments-results.html"),
      publishRuntime,
    );
    frameWindow.dispatchEvent(new PageTransitionEvent("pagehide"));
    await Promise.resolve();
    expect(publishRuntime.mock.calls).toEqual([[{ state: "unavailable" }]]);
    dispose();
  });

  it("accepts a Sirius-owned application frame on an internal port", () => {
    const event = new MessageEvent("message", {
      origin: "http://sirius.unimet.edu.ve:50000",
      data: { kind: WEB_PAYMENTS_BRIDGE_KIND, model: syntheticModel },
    });
    expect(webPaymentsFromBridgeEvent(event)).toEqual(syntheticModel);
  });

  it("rejects other origins, unknown fields, and malformed amounts", () => {
    const thirdParty = new MessageEvent("message", {
      origin: "https://example.invalid",
      data: { kind: WEB_PAYMENTS_BRIDGE_KIND, model: syntheticModel },
    });
    const malformed = new MessageEvent("message", {
      origin: SIRIUS_ORIGIN,
      data: {
        kind: WEB_PAYMENTS_BRIDGE_KIND,
        model: { ...syntheticModel, totalDollars: "not-an-amount" },
      },
    });
    expect(webPaymentsFromBridgeEvent(thirdParty)).toBeNull();
    expect(webPaymentsFromBridgeEvent(malformed)).toBeNull();
  });
});
