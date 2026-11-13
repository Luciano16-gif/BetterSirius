import {
  ReadOnlyPathNavigator,
  type ReadOnlyNavigationResult,
} from "./read-only-navigator";

const PRONTO_PAGO_PATH = ["Procesos Administrativos", "Descuento por Pronto Pago"] as const;
const WEB_PAYMENTS_PATH = ["Procesos Administrativos", "Web de Pagos"] as const;
const PAYMENT_MESSAGES_PATH = ["Visualizar lista"] as const;

export class FinancialNavigator {
  readonly #navigator: ReadOnlyPathNavigator;

  constructor(rootDocument: Document) {
    this.#navigator = new ReadOnlyPathNavigator(rootDocument);
  }

  openProntoPago(): Promise<ReadOnlyNavigationResult> {
    return this.#navigator.open(PRONTO_PAGO_PATH);
  }

  openWebPayments(): Promise<ReadOnlyNavigationResult> {
    return this.#navigator.open(WEB_PAYMENTS_PATH);
  }

  openMessages(): Promise<ReadOnlyNavigationResult> {
    return this.#navigator.open(PAYMENT_MESSAGES_PATH);
  }
}
