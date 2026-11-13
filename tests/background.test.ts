import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WEB_PAYMENTS_RUNTIME_DOWNSTREAM,
  WEB_PAYMENTS_RUNTIME_PROBE,
  WEB_PAYMENTS_RUNTIME_UPSTREAM,
  WEB_PAYMENTS_RUNTIME_VALIDATE,
} from "../src/finance/web-payments-runtime";

const portalTab = { id: 17, url: "http://sirius.unimet.edu.ve/irj/synthetic" };
const summary = {
  state: "results",
  balanceAtDate: "125,00",
  zellePayment: "25,00",
  totalDollars: "100,00",
  totalDebtBolivars: "9.999,99",
};

async function background() {
  vi.resetModules();
  const addListener = vi.fn();
  const sendMessage = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("chrome", { runtime: { onMessage: { addListener } }, tabs: { sendMessage } });
  await import("../src/background/index");
  return { receive: addListener.mock.calls[0]![0] as (message: unknown, sender: unknown) => void, sendMessage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("payment runtime relay", () => {
  it("keeps the document identity on results and clears", async () => {
    const { receive, sendMessage } = await background();
    receive({ kind: WEB_PAYMENTS_RUNTIME_UPSTREAM, model: summary }, { tab: portalTab, frameId: 2, documentId: "payments" });
    receive({ kind: WEB_PAYMENTS_RUNTIME_UPSTREAM, model: { state: "unavailable" } }, { tab: portalTab, frameId: 3, documentId: "other" });
    expect(sendMessage.mock.calls).toEqual([
      [17, { kind: WEB_PAYMENTS_RUNTIME_DOWNSTREAM, source: "payments", model: summary }, { frameId: 0 }],
      [17, { kind: WEB_PAYMENTS_RUNTIME_DOWNSTREAM, source: "other", model: { state: "unavailable" } }, { frameId: 0 }],
    ]);
  });

  it("invalidates only vanished documents after the portal frame changes", async () => {
    const { receive, sendMessage } = await background();
    sendMessage.mockImplementation((_tabId, message, options) => {
      if (message.kind !== WEB_PAYMENTS_RUNTIME_PROBE) return Promise.resolve();
      return options.documentId === "current" ? Promise.resolve(true) : Promise.reject(new Error("Document removed"));
    });
    receive({ kind: WEB_PAYMENTS_RUNTIME_VALIDATE, sources: ["current", "removed"] }, { tab: portalTab, frameId: 0 });
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(
      17,
      { kind: WEB_PAYMENTS_RUNTIME_DOWNSTREAM, source: "removed", model: { state: "unavailable" } },
      { frameId: 0 },
    ));
    expect(sendMessage).not.toHaveBeenCalledWith(
      17,
      expect.objectContaining({ source: "current" }),
      { frameId: 0 },
    );
  });

  it("rejects relays without a source identity and validation from subframes", async () => {
    const { receive, sendMessage } = await background();
    receive({ kind: WEB_PAYMENTS_RUNTIME_UPSTREAM, model: summary }, { tab: portalTab, frameId: 2 });
    receive({ kind: WEB_PAYMENTS_RUNTIME_VALIDATE, sources: ["other"] }, { tab: portalTab, frameId: 2 });
    receive({ kind: WEB_PAYMENTS_RUNTIME_VALIDATE, sources: ["other"] }, { tab: { id: 17, url: "http://example.invalid" }, frameId: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
