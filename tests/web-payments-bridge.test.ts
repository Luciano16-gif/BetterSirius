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
