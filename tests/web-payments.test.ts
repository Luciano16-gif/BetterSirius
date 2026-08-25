import { describe, expect, it } from "vitest";
import { readWebPayments } from "../src/finance/web-payments";
import { fixtureDocument } from "./helpers/fixture";

describe("Web de Pagos reader", () => {
  it("reads only the verified financial summary and message metadata", () => {
    expect(readWebPayments(fixtureDocument("web-payments-results.html"))).toEqual({
      state: "results",
      balanceAtDate: "125,00",
      zellePayment: "25,00",
      totalDollars: "100,00",
      totalDebtBolivars: "9.999,99",
      noPendingPayments: true,
      messageCount: 2,
      messageListAvailable: true,
    });
  });

  it("fails closed when the financial labels are incomplete", () => {
    const document = new DOMParser().parseFromString(
      "<h1>Web de Pagos</h1><p>SALDO TOTAL A LA FECHA 10,00</p>",
      "text/html",
    );
    expect(readWebPayments(document)).toEqual({
      state: "unknown",
      noPendingPayments: false,
      messageListAvailable: false,
    });
  });

  it("reads SAP rows where labels and amounts are separate cells", () => {
    expect(readWebPayments(fixtureDocument("web-payments-sap-row.html"))).toEqual({
      state: "results",
      balanceAtDate: "0,00",
      zellePayment: "0,00",
      totalDollars: "0,00",
      totalDebtBolivars: "0,00",
      noPendingPayments: true,
      messageListAvailable: false,
    });
  });

  it("does not treat unrelated pages as a financial account", () => {
    const document = new DOMParser().parseFromString("<main>Contenido desconocido</main>", "text/html");
    expect(readWebPayments(document)).toEqual({ state: "unavailable" });
  });
});
