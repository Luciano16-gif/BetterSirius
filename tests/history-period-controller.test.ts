import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryPeriodController } from "../src/navigation/history-period-controller";

afterEach(() => {
  document.body.replaceChildren();
});

describe("historical period controller", () => {
  it("discovers periods, keeps the selected row, and activates one visible selector", () => {
    document.body.innerHTML = `
      <p>Seleccione un periodo (utilice la columna de la izquierda)</p>
      <h2>Lista de Periodos Academicos</h2>
      <table>
        <tr><th></th><th>Codigo</th><th>Ano Academico</th><th>Per. Acad.</th></tr>
        <tr aria-selected="true"><td class="current"></td><td>SYN-NEW</td><td>2100</td><td>Periodo reciente</td></tr>
        <tr><td class="previous" onmousedown="return false"></td><td>SYN-OLD</td><td>2099</td><td>Periodo anterior</td></tr>
      </table>`;
    const selected = vi.fn();
    document.querySelector(".previous")?.addEventListener("mousedown", selected);
    const controller = new HistoryPeriodController(document);

    const periods = controller.discover();
    expect(periods).toEqual([
      { index: 1, code: "SYN-NEW", academicYear: "2100", label: "Periodo reciente", active: true },
      { index: 2, code: "SYN-OLD", academicYear: "2099", label: "Periodo anterior", active: false },
    ]);
    expect(controller.activate(periods[1]!)).toBe("activated");
    expect(selected).toHaveBeenCalledOnce();
  });

  it("defaults to the first, newest row when SAP exposes no selected semantics", () => {
    document.body.innerHTML = `
      <table>
        <tr><th></th><th>Codigo</th><th>Ano Academico</th><th>Periodo Academico</th></tr>
        <tr><td></td><td>SYN-NEW</td><td>2100</td><td>Periodo reciente</td></tr>
        <tr><td></td><td>SYN-OLD</td><td>2099</td><td>Periodo anterior</td></tr>
      </table>`;
    const periods = new HistoryPeriodController(document).discover();

    expect(periods.map(({ active }) => active)).toEqual([true, false]);
  });

  it("rejects a replaced row instead of activating stale SAP state", () => {
    document.body.innerHTML = `
      <table>
        <tr><th></th><th>Codigo</th><th>Ano Academico</th><th>Per. Acad.</th></tr>
        <tr><td></td><td>SYN-P</td><td>2100</td><td>Periodo sintetico</td></tr>
      </table>`;
    const controller = new HistoryPeriodController(document);
    const [period] = controller.discover();
    document.querySelector("table")?.remove();

    expect(period && controller.activate(period)).toBe("stale");
  });
});
