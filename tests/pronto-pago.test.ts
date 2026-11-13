import { describe, expect, it } from "vitest";
import { isProntoPagoLocation, readProntoPago, validateProntoPago } from "../src/finance/pronto-pago";

function statementDocument(): Document {
  return new DOMParser().parseFromString(`
    <div class="card">
      <h1>Estado de cuenta Pronto Pago</h1>
      <p>Estudiante de prueba | SYN-001</p>
      <div class="tasa-unimet"><small>Tasa BCV Oficial</small><b>40,00 Bs.</b><span>Lunes, 1 Enero 2099</span></div>
      <table>
        <thead><tr><th>Fecha</th><th>Detalle del Concepto</th><th>Monto USD</th></tr></thead>
        <tbody>
          <tr><td>01/01/2099</td><td>Módulos académicos de ejemplo</td><td>$ 100,00</td></tr>
          <tr class="is-desc"><td>01/01/2099</td><td>Descuento de Pronto Pago</td><td>$ -10,00</td></tr>
        </tbody>
      </table>
      <div class="box"><small>Total USD</small><span>$ 90,00</span></div>
      <div class="box"><small>Total BS</small><span>Bs. 3.600,00</span></div>
      <form><input type="hidden" name="token" value="SYN-TOKEN"><button>Zelle</button></form>
    </div>`, "text/html");
}

describe("Pronto Pago statement", () => {
  it("reads displayed totals, the rate and both movements without retaining identity or payment controls", () => {
    const model = readProntoPago(statementDocument());
    expect(model).toEqual({
      state: "results",
      exchangeRate: "40,00 Bs.",
      exchangeDate: "Lunes, 1 Enero 2099",
      totalUsd: "$ 90,00",
      totalBs: "Bs. 3.600,00",
      lines: [
        { date: "01/01/2099", concept: "Módulos académicos de ejemplo", amountUsd: "$ 100,00", discount: false },
        { date: "01/01/2099", concept: "Descuento de Pronto Pago", amountUsd: "$ -10,00", discount: true },
      ],
    });
    expect(validateProntoPago({ ...model, hidden: "SYN-TOKEN" })).toEqual(model);
    expect(validateProntoPago({ ...model, totalBs: "pending" })).toBeNull();
  });

  it("does not infer amounts from an incomplete statement", () => {
    const document = statementDocument();
    document.querySelector(".box:last-of-type")?.remove();
    expect(readProntoPago(document)).toEqual({ state: "unknown" });
  });

  it("only accepts the observed statement origin and exact route", () => {
    expect(isProntoPagoLocation(new URL("http://gapi2.unimet.edu.ve/prontopago/cuenta.php"))).toBe(true);
    expect(isProntoPagoLocation(new URL("http://gapi2.unimet.edu.ve/prontopago/otro.php"))).toBe(false);
    expect(isProntoPagoLocation(new URL("http://example.invalid/prontopago/cuenta.php"))).toBe(false);
  });
});
