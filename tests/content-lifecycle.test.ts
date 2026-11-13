import { afterEach, describe, expect, it, vi } from "vitest";
import { SHELL_HOST_ID } from "../src/core/constants";
import {
  WEB_PAYMENTS_RUNTIME_DOWNSTREAM,
  WEB_PAYMENTS_RUNTIME_VALIDATE,
} from "../src/finance/web-payments-runtime";
import { WEB_PAYMENTS_BRIDGE_KIND } from "../src/finance/web-payments-bridge";
import { fixtureDocument } from "./helpers/fixture";

const summary = {
  state: "results",
  balanceAtDate: "125,00",
  zellePayment: "25,00",
  totalDollars: "100,00",
  totalDebtBolivars: "9.999,99",
};

async function start(fixture = "portal-shell.html", runtime = true) {
  vi.resetModules();
  const source = fixtureDocument(fixture);
  document.head.innerHTML = source.head.innerHTML;
  document.body.innerHTML = source.body.innerHTML;
  document.querySelector("iframe")?.setAttribute("src", "/unrecognised");
  const listeners = new Set<(message: unknown) => void>();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  if (runtime) {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: (listener: (message: unknown) => void) => listeners.add(listener),
          removeListener: (listener: (message: unknown) => void) => listeners.delete(listener),
        },
      },
    });
  }
  await import("../src/content/index");
  return {
    listeners,
    sendMessage,
    receive: (source: string, model: unknown) => {
      for (const listener of listeners) listener({ kind: WEB_PAYMENTS_RUNTIME_DOWNSTREAM, source, model });
    },
    payments: () => document.getElementById(SHELL_HOST_ID)?.shadowRoot?.querySelector("[data-payments-view]")?.textContent,
  };
}

afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("content frame and page lifecycle", () => {
  it("keeps independent runtime sources and invalidates their own data", async () => {
    const { receive, payments } = await start();
    receive("payments", summary);
    receive("other", { state: "unavailable" });
    expect(payments()).toContain("125,00");
    receive("payments", { state: "unknown" });
    expect(payments()).not.toContain("125,00");
    receive("payments", summary);
    receive("payments", { state: "unavailable" });
    expect(payments()).not.toContain("125,00");
  });

  it("does not keep a duplicate DOM result after the runtime source clears", async () => {
    const { receive, payments } = await start();
    const frame = document.querySelector("iframe")!;
    receive("payments", summary);
    window.dispatchEvent(new MessageEvent("message", {
      origin: "http://sirius.unimet.edu.ve",
      source: frame.contentWindow,
      data: { kind: WEB_PAYMENTS_BRIDGE_KIND, model: summary },
    }));
    receive("payments", { state: "unavailable" });
    expect(payments()).not.toContain("125,00");
  });

  it("checks cached runtime documents when an unrecognised frame is removed", async () => {
    const { receive, sendMessage } = await start();
    receive("payments", summary);
    document.querySelector("iframe")!.remove();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      kind: WEB_PAYMENTS_RUNTIME_VALIDATE,
      sources: ["payments"],
    }));
  });

  it("discards DOM fallback data when its frame is removed", async () => {
    const { payments } = await start("portal-shell.html", false);
    const frame = document.querySelector("iframe")!;
    window.dispatchEvent(new MessageEvent("message", {
      origin: "http://sirius.unimet.edu.ve",
      source: frame.contentWindow,
      data: { kind: WEB_PAYMENTS_BRIDGE_KIND, model: summary },
    }));
    expect(payments()).toContain("125,00");
    frame.remove();
    await vi.waitFor(() => expect(payments()).not.toContain("125,00"));
  });

  it("keeps the shell and listeners across repeated cache restores and disposes on exit", async () => {
    const { receive, payments, listeners } = await start();
    const host = document.getElementById(SHELL_HOST_ID);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      expect(document.getElementById(SHELL_HOST_ID)).toBe(host);
      receive("payments", summary);
      expect(payments()).toContain("125,00");
    }
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(document.getElementById(SHELL_HOST_ID)).toBeNull();
    expect(listeners.size).toBe(0);
  });

  it("keeps native login presentation across a cache restore", async () => {
    await start("login.html");
    const login = document.querySelector("[data-better-sirius-login-shell]");
    expect(login).not.toBeNull();
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(document.querySelector("[data-better-sirius-login-shell]")).toBe(login);
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(document.querySelector("[data-better-sirius-login-shell]")).toBeNull();
  });
});
