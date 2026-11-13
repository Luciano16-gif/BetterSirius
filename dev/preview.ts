import type { ShellModel } from "../src/core/types";
import { academicProcessCatalog } from "../src/academic/processes";
import { FinancialNavigator } from "../src/navigation/financial-navigator";
import { readProntoPago } from "../src/finance/pronto-pago";
import { mountBetterSiriusShell } from "../src/ui/shell";

const parameters = new URLSearchParams(window.location.search);
const state = parameters.get("state");
const syntheticControl = document.querySelector<HTMLButtonElement>("#synthetic-sap-control");
const syntheticResult = document.querySelector<HTMLOutputElement>("#synthetic-sap-result");
const syntheticDiscount = document.querySelector<HTMLElement>("#synthetic-pronto-pago-view");
const financialNavigator = new FinancialNavigator(document);

syntheticControl?.addEventListener("click", () => {
  if (syntheticResult) syntheticResult.value = "Control activado";
});
document.querySelector("#synthetic-pronto-pago")?.addEventListener("click", () => {
  if (syntheticDiscount) syntheticDiscount.hidden = false;
});
document.querySelector("#synthetic-web-payments")?.addEventListener("click", () => {
  if (syntheticDiscount) syntheticDiscount.hidden = true;
});
const model: ShellModel = {
  portalState: state === "error" ? "sap-error" : state === "expired" ? "session-expired" : "portal-shell",
  academicProcesses: academicProcessCatalog(true),
  academicHistory: state === "loading"
    ? {
        state: "initial",
        courses: [],
        programs: [{ index: 1, label: "Programa sintético" }],
        pending: "program",
      }
    : state === "empty"
    ? { state: "unavailable", courses: [] }
    : {
        state: "results",
        courses: [
          { period: "2026-S1", code: "SYN-204", name: "Materia sintética", grade: "A", approvedCredits: "4", attemptedCredits: "4", points: "16" },
          { period: "2026-S1", code: "SYN-108", name: "Laboratorio de prueba", grade: "B", approvedCredits: "3", attemptedCredits: "3", points: "9" },
        ],
      },
  academicOffer: state === "offer-loading"
    ? { state: "initial", offerings: [], query: "SYN100", pending: "searching" }
    : state === "offer-empty"
      ? { state: "empty", offerings: [], query: "SYN404" }
      : state === "offer-lookup"
        ? {
            state: "initial",
            offerings: [],
            lookup: {
              state: "results",
              query: "FGE",
              options: [
                { index: 0, code: "SYN-FGE-01", name: "Electiva sintética de cultura" },
                { index: 1, code: "SYN-FGE-02", name: "Electiva sintética de sociedad" },
                { index: 2, code: "SYN-FGE-03", name: "Electiva sintética de pensamiento" },
              ],
            },
          }
      : {
          state: "results",
          query: "SYN100",
          offerings: [
            {
              code: "SYN100",
              name: "Materia sintética",
              credits: "4",
              period: "SYN-P1",
              block: "SYN100-1",
              blockDescription: "SYN100-1",
              schedule: "Lu-08:45-10:15",
              schedules: ["Lu-08:45-10:15", "Ma-08:45-10:15", "Mi-08:45-10:15", "Ju-08:45-10:15", "Vi-08:45-10:15"],
              capacity: "24",
              prerequisite: "Materia sintética previa",
              prerequisiteCode: "SYN099",
              modality: "Presencial",
              firstMonthCost: "SYN-COST",
            },
            {
              code: "SYN100",
              name: "Materia sintética",
              credits: "4",
              period: "SYN-P1",
              block: "SYN100-2",
              blockDescription: "SYN100-2",
              schedule: "Lu-10:30-12:00",
              schedules: ["Lu-10:30-12:00", "Mi-10:30-12:00", "Vi-10:30-12:00"],
              capacity: "18",
              prerequisite: "Materia sintética previa",
              prerequisiteCode: "SYN099",
              modality: "Presencial",
              firstMonthCost: "SYN-COST",
            },
          ],
        },
  registrationWindow: { state: "unavailable" },
  prontoPago: { state: "unavailable" },
  webPayments: state === "payments-loading"
    ? { state: "unavailable", pending: "opening" }
    : {
        state: "results",
        balanceAtDate: "125,00",
        zellePayment: "25,00",
        totalDollars: "100,00",
        totalDebtBolivars: "9.999,99",
        noPendingPayments: false,
        messageCount: 2,
        messageListAvailable: true,
      },
  applications:
    state === "empty"
      ? []
      : [
          { application: "historical-grades", state: "results", confidence: 1 },
          { application: "academic-offer", state: "initial", confidence: 1 },
          { application: "web-payments", state: "results", confidence: 1 },
          { application: "registration", state: "initial", confidence: 1 },
        ],
};

const shell = mountBetterSiriusShell(document, model, {
  onOpenProntoPago: async () => {
    shell.update({ ...model, prontoPago: { state: "opening" } });
    const result = await financialNavigator.openProntoPago();
    const prontoPago = state === "pronto-unknown" ? { state: "unknown" as const } : readProntoPago(document);
    shell.update({ ...model, prontoPago });
    return result;
  },
  onOpenWebPayments: async () => {
    const result = await financialNavigator.openWebPayments();
    shell.update(model);
    return result;
  },
});

const requestedPanel = parameters.get("panel");
if (["academic", "history"].includes(requestedPanel ?? "")) {
  document
    .getElementById("better-sirius-root")
    ?.shadowRoot?.querySelector<HTMLButtonElement>(`[data-view='${requestedPanel}']`)
    ?.click();
}

if (requestedPanel === "payments" || requestedPanel === "web-payments") {
  const route = requestedPanel === "web-payments" ? "web-payments" : "payments";
  document
    .getElementById("better-sirius-root")
    ?.shadowRoot?.querySelector<HTMLButtonElement>(`[data-route='${route}']`)
    ?.click();
}

if (requestedPanel === "offer") {
  document
    .getElementById("better-sirius-root")
    ?.shadowRoot?.querySelector<HTMLButtonElement>("[data-open-academic-offer]")
    ?.click();
}

if (parameters.get("inquiry") === "period") {
  const shadow = document.getElementById("better-sirius-root")?.shadowRoot;
  shadow?.querySelector<HTMLButtonElement>("[data-view='academic']")?.click();
  shadow?.querySelector<HTMLButtonElement>("[data-open-period-grades]")?.click();
}

if (parameters.get("mode") === "original") {
  document
    .getElementById("better-sirius-root")
    ?.shadowRoot?.querySelector<HTMLButtonElement>("[data-show-original]")
    ?.click();
}
