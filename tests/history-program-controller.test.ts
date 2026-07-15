import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryProgramController } from "../src/navigation/history-program-controller";

afterEach(() => {
  document.body.replaceChildren();
});

describe("historical program controller", () => {
  it("reads native visible labels and delegates the selected index", async () => {
    document.body.innerHTML = `
      <label for="program">Seleccione un programa</label>
      <select id="program">
        <option>Seleccione</option>
        <option value="must-not-be-read">Programa sintético</option>
      </select>`;
    const select = document.querySelector("select");
    const changed = vi.fn();
    select?.addEventListener("change", changed);
    const controller = new HistoryProgramController(document);

    const programs = await controller.discover();
    expect(programs).toEqual([{ index: 1, label: "Programa sintético" }]);
    expect(controller.activate(programs[0]!)).toBe("activated");
    expect(select?.selectedIndex).toBe(1);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("uses the only visible select when old SAP markup has no label association", async () => {
    document.body.innerHTML = `
      <span>Programa académico</span>
      <select><option>Seleccione</option><option>Carrera visible</option></select>`;
    const controller = new HistoryProgramController(document);

    expect(await controller.discover()).toEqual([{ index: 1, label: "Carrera visible" }]);
  });

  it("discovers and activates a program row in the observed Web Dynpro table flow", async () => {
    document.body.innerHTML = `
      <p>Seleccione un programa (utilice la columna izquierda)</p>
      <h2>Lista de Programas Academicos</h2>
      <table>
        <tr><th></th><th>Codigo</th><th>Descripcion</th></tr>
        <tr><td class="selector" onmousedown="return false"></td><td>SYN-PROG</td><td>Programa sintetico</td></tr>
      </table>`;
    const selector = document.querySelector<HTMLElement>(".selector");
    const selected = vi.fn();
    selector?.addEventListener("mousedown", selected);
    const controller = new HistoryProgramController(document);

    const programs = await controller.discover();
    expect(programs).toEqual([{ index: 1, label: "Programa sintetico" }]);
    expect(controller.activate(programs[0]!)).toBe("activated");
    expect(selected).toHaveBeenCalledOnce();
  });

  it("opens a Web Dynpro-style popup and delegates to its live option", async () => {
    document.body.innerHTML = `
      <div class="program-field">
        <span>Seleccione un programa</span>
        <button type="button" aria-haspopup="listbox" lsevents="redacted">Abrir</button>
        <div role="listbox" hidden>
          <div role="option" lsevents="redacted">Programa A</div>
          <div role="option" lsevents="redacted">Programa B</div>
        </div>
      </div>`;
    const opener = document.querySelector<HTMLButtonElement>("button");
    const listbox = document.querySelector<HTMLElement>("[role='listbox']");
    opener?.addEventListener("click", () => { if (listbox) listbox.hidden = false; });
    const option = document.querySelectorAll<HTMLElement>("[role='option']")[1];
    const selected = vi.fn();
    option?.addEventListener("click", selected);
    const controller = new HistoryProgramController(document);

    const programs = await controller.discover();
    expect(programs.map(({ label }) => label)).toEqual(["Programa A", "Programa B"]);
    expect(controller.activate(programs[1]!)).toBe("activated");
    expect(selected).toHaveBeenCalledOnce();
  });

  it("rejects a replaced or relabeled option instead of guessing", async () => {
    document.body.innerHTML = `
      <div><span>Seleccione un programa</span>
        <button type="button" aria-haspopup="listbox">Abrir</button>
        <div role="listbox" hidden><div role="option">Programa A</div></div>
      </div>`;
    const opener = document.querySelector<HTMLButtonElement>("button");
    const listbox = document.querySelector<HTMLElement>("[role='listbox']");
    opener?.addEventListener("click", () => { if (listbox) listbox.hidden = false; });
    const controller = new HistoryProgramController(document);
    const [program] = await controller.discover();
    document.querySelector("[role='option']")?.remove();

    expect(program && controller.activate(program)).toBe("stale");
  });

  it("recognizes legacy popup cells that become visible after opening", async () => {
    document.body.innerHTML = `
      <div>
        <span>Programa académico</span>
        <button type="button" lsevents="redacted">Abrir</button>
        <table hidden><tr><td onclick="return false">Carrera A</td></tr></table>
      </div>`;
    const opener = document.querySelector<HTMLButtonElement>("button");
    const popup = document.querySelector<HTMLTableElement>("table");
    opener?.addEventListener("click", () => { if (popup) popup.hidden = false; });
    const option = document.querySelector<HTMLTableCellElement>("td");
    const selected = vi.fn();
    option?.addEventListener("click", selected);
    const controller = new HistoryProgramController(document);

    const programs = await controller.discover();
    expect(programs.map(({ label }) => label)).toEqual(["Carrera A"]);
    expect(controller.activate(programs[0]!)).toBe("activated");
    expect(selected).toHaveBeenCalledOnce();
  });

  it("toggles the observed read-only withdrawn-course filter without reading SAP state blobs", () => {
    document.body.innerHTML = `
      <span class="filter" lsdata="redacted">
        <img id="synthetic-img" alt="">
        <span>Mostrar materias retiradas</span>
      </span>`;
    const graphic = document.querySelector<HTMLElement>("#synthetic-img");
    const toggled = vi.fn();
    graphic?.addEventListener("mousedown", toggled);
    const controller = new HistoryProgramController(document);

    expect(controller.setWithdrawnCourses(true)).toBe("activated");
    expect(controller.setWithdrawnCourses(true)).toBe("activated");
    expect(controller.setWithdrawnCourses(false)).toBe("activated");
    expect(toggled).toHaveBeenCalledTimes(2);
  });
});
