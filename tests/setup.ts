import { vi } from "vitest";

const networkDenied = (): never => {
  throw new Error("Network access is forbidden in BetterSirius automated tests.");
};

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: vi.fn(networkDenied),
});

Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  value: class ForbiddenWebSocket {
    constructor() {
      networkDenied();
    }
  },
});

vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(networkDenied);
vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(networkDenied);
Object.defineProperty(navigator, "sendBeacon", {
  configurable: true,
  value: vi.fn(networkDenied),
});
