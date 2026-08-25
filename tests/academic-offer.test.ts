import { describe, expect, it, vi } from "vitest";
import { AcademicOfferController, readAcademicOffer } from "../src/academic/offer";
import { fixtureDocument } from "./helpers/fixture";

function resultDocumentWithoutSearchControls(): Document {
  const document = fixtureDocument("academic-offer-results.html");
  document.querySelector("input[maxlength='12']")?.remove();
  document.querySelector(".lsButton")?.remove();
  return document;
}

describe("academic offer", () => {
  it("recognizes the verified initial search state", () => {
    expect(readAcademicOffer(fixtureDocument("academic-offer-initial.html"))).toEqual({
      state: "initial",
      offerings: [],
    });
  });

  it("normalizes the verified result columns and carries repeated course identity", () => {
    expect(readAcademicOffer(fixtureDocument("academic-offer-results.html"))).toEqual({
      state: "results",
      offerings: [
        {
          code: "SYN100",
          name: "Materia sintética",
          credits: "4",
          period: "SYN-P1",
          block: "01",
          blockDescription: "Sección 01",
          schedule: "LU 08:00–10:00",
          schedules: ["LU 08:00–10:00"],
          capacity: "24",
          prerequisite: "Ninguno",
          modality: "Presencial",
          firstMonthCost: "SYN-COST",
        },
        {
          code: "SYN100",
          name: "Materia sintética",
          credits: "4",
          period: "SYN-P1",
          block: "02",
          blockDescription: "Sección 02",
          schedule: "MI 14:00–16:00",
          schedules: ["MI 14:00–16:00"],
          capacity: "18",
          prerequisite: "Ninguno",
          modality: "Presencial",
          firstMonthCost: "SYN-COST",
        },
      ],
    });
  });

  it("groups continuation rows into sections and restores their shifted columns", () => {
    expect(readAcademicOffer(fixtureDocument("academic-offer-multi-meeting-results.html"))).toEqual({
      state: "results",
      offerings: [
        {
          code: "SYN200",
          name: "Matemática sintética",
          credits: "3",
          period: "7",
          block: "SYN200-1",
          blockDescription: "SYN200-1",
          schedule: "Lu-08:45-10:15",
          schedules: ["Lu-08:45-10:15", "Ma-08:45-10:15", "Mi-08:45-10:15"],
          capacity: "13",
          prerequisite: "Matemática previa",
          prerequisiteCode: "SYN199",
          modality: "SYN200-P",
          firstMonthCost: "0,00",
        },
        {
          code: "SYN200",
          name: "Matemática sintética",
          credits: "3",
          period: "7",
          block: "SYN200-2",
          blockDescription: "SYN200-2",
          schedule: "Ju-10:30-12:00",
          schedules: ["Ju-10:30-12:00", "Vi-10:30-12:00"],
          capacity: "11",
          prerequisite: "Matemática previa",
          prerequisiteCode: "SYN199",
          modality: "SYN200-P",
          firstMonthCost: "0,00",
        },
      ],
    });
  });

  it("treats a compatible result table without rows as a valid empty response", () => {
    expect(readAcademicOffer(fixtureDocument("academic-offer-empty.html"))).toEqual({
      state: "empty",
      offerings: [],
    });
  });

  it("recognizes the native name-or-code selector and its result rows", () => {
    expect(readAcademicOffer(fixtureDocument("academic-offer-lookup-initial.html"))).toEqual({
      state: "unavailable",
      offerings: [],
      lookup: { state: "initial", options: [] },
    });
    expect(readAcademicOffer(fixtureDocument("academic-offer-lookup-results.html"))).toEqual({
      state: "unavailable",
      offerings: [],
      lookup: {
        state: "results",
        options: [
          { index: 0, code: "SYN-FGE-01", name: "Electiva sintética de cultura" },
          { index: 1, code: "SYN-FGE-02", name: "Electiva sintética de sociedad" },
        ],
      },
    });
  });

  it("treats an empty compatible selector response as a valid result", () => {
    expect(readAcademicOffer(fixtureDocument("academic-offer-lookup-empty.html"))).toEqual({
      state: "unavailable",
      offerings: [],
      lookup: { state: "empty", options: [] },
    });
  });

  it("delegates one explicit code search to the current native controls", async () => {
    const document = fixtureDocument("academic-offer-initial.html");
    const input = document.querySelector<HTMLInputElement>("input[type='text']");
    const button = document.querySelector<HTMLElement>(".lsButton");
    if (!input || !button) throw new Error("Synthetic offer controls are missing.");
    const inputEvent = vi.fn();
    const changeEvent = vi.fn();
    const click = vi.fn();
    input.addEventListener("input", inputEvent);
    input.addEventListener("change", changeEvent);
    button.addEventListener("click", click);

    await expect(new AcademicOfferController(document).search(" syn100 ")).resolves.toBe("activated");
    expect(input.value).toBe("SYN100");
    expect(inputEvent).toHaveBeenCalledOnce();
    expect(changeEvent).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it("waits for a fresh exact-code response before publishing its sections", async () => {
    vi.useFakeTimers();
    try {
      const document = fixtureDocument("academic-offer-initial.html");
      const search = document.querySelector<HTMLElement>(".lsButton");
      if (!search) throw new Error("Synthetic offer search is missing.");
      search.addEventListener("click", () => {
        setTimeout(() => {
          document.body.innerHTML = `
            <table>
              <tr><th>Código</th><th>Asignatura</th><th>Bloque</th><th>Horario</th><th>Cupo</th></tr>
              <tr><td>SYN200</td><td>Respuesta nueva</td><td>01</td><td>Lu-08:00-09:30</td><td>12</td></tr>
            </table>`;
        }, 200);
      });

      const controller = new AcademicOfferController(document);
      await expect(controller.search("SYN200")).resolves.toBe("activated");
      const hydration = controller.hydrateSearchResults();
      let settled = false;
      void hydration.then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toBe(false);
      await vi.runAllTimersAsync();
      await expect(hydration).resolves.toMatchObject({
        status: "complete",
        offer: {
          state: "results",
          offerings: [{
            code: "SYN200",
            name: "Respuesta nueva",
            block: "01",
            schedule: "Lu-08:00-09:30",
            capacity: "12",
          }],
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the native value help and submits one explicit natural-language lookup", async () => {
    const offerDocument = fixtureDocument("academic-offer-initial.html");
    const helper = offerDocument.querySelector<HTMLElement>(".lsField__help--f4");
    const helperClick = vi.fn();
    helper?.addEventListener("click", helperClick);
    await expect(new AcademicOfferController(offerDocument).openLookup()).resolves.toBe("activated");
    expect(helperClick).toHaveBeenCalledOnce();

    const lookupDocument = fixtureDocument("academic-offer-lookup-initial.html");
    const input = lookupDocument.querySelector<HTMLInputElement>("input[type='text']");
    const search = lookupDocument.querySelector<HTMLElement>(".lsButton");
    const searchClick = vi.fn();
    search?.addEventListener("click", searchClick);
    await expect(new AcademicOfferController(lookupDocument).searchLookup(" psicología positiva "))
      .resolves.toBe("activated");
    expect(input?.value).toBe("psicología positiva");
    expect(searchClick).toHaveBeenCalledOnce();
  });

  it("delegates a code prefix as one native Web Dynpro pattern", async () => {
    const document = fixtureDocument("academic-offer-lookup-initial.html");
    const input = document.querySelector<HTMLInputElement>("input[type='text']");
    const search = document.querySelector<HTMLElement>(".lsButton");
    const searchClick = vi.fn();
    search?.addEventListener("click", searchClick);

    await expect(new AcademicOfferController(document).searchLookup("FGE")).resolves.toBe("activated");
    expect(input?.value).toBe("FGE*");
    expect(searchClick).toHaveBeenCalledOnce();
  });

  it("waits for a fresh native response instead of hydrating rows from the previous query", async () => {
    vi.useFakeTimers();
    try {
      const document = fixtureDocument("academic-offer-lookup-results.html");
      const input = document.querySelector<HTMLInputElement>("input[type='text']");
      const search = document.querySelector<HTMLElement>(".lsButton");
      const rows = document.querySelectorAll<HTMLTableElement>("table.urSTCS table")[1];
      if (!input || !search || !rows) throw new Error("Synthetic lookup controls are missing.");
      input.value = "FGE*";
      search.addEventListener("click", () => {
        setTimeout(() => {
          rows.innerHTML = "<tr><td>FGESP03</td><td>CONTENIDOS DIGITALES PARA EL METAVERSO</td></tr>";
        }, 200);
      });

      const controller = new AcademicOfferController(document);
      await expect(controller.searchLookup("Metaverso")).resolves.toBe("activated");
      const hydration = controller.hydrateLookupResults();
      let settled = false;
      void hydration.then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toBe(false);
      await vi.runAllTimersAsync();
      await expect(hydration).resolves.toEqual({
        status: "complete",
        options: [{
          index: 0,
          code: "FGESP03",
          name: "CONTENIDOS DIGITALES PARA EL METAVERSO",
        }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("progressively loads every virtualized native lookup row", async () => {
    vi.useFakeTimers();
    try {
      const document = fixtureDocument("academic-offer-lookup-results.html");
      const grid = document.querySelector<HTMLTableElement>("table.urSTCS");
      const rows = grid?.querySelectorAll<HTMLTableElement>("table")[1];
      if (!grid || !rows) throw new Error("Synthetic virtualized lookup grid is missing.");
      const scroller = document.createElement("div");
      grid.replaceWith(scroller);
      scroller.append(grid);
      Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 100 });
      Object.defineProperty(scroller, "scrollHeight", {
        configurable: true,
        get: () => rows.rows.length >= 32 ? 100 : 400,
      });
      scroller.addEventListener("scroll", () => {
        const current = rows.rows.length;
        const target = Math.min(32, current + 10);
        for (let index = current; index < target; index += 1) {
          const row = rows.insertRow();
          row.insertCell().textContent = `SYN-FGE-${String(index + 1).padStart(2, "0")}`;
          row.insertCell().textContent = `Electiva sintética ${index + 1}`;
        }
      });

      const hydration = new AcademicOfferController(document).hydrateLookupResults();
      await vi.runAllTimersAsync();
      await expect(hydration).resolves.toMatchObject({ status: "expanded" });
      expect(readAcademicOffer(document).lookup?.options).toHaveLength(32);
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances SAP's custom paged scrollbar until the lookup stops changing", async () => {
    vi.useFakeTimers();
    try {
      const document = fixtureDocument("academic-offer-lookup-results.html");
      const grid = document.querySelector<HTMLTableElement>("table.urSTCS");
      const rows = grid?.querySelectorAll<HTMLTableElement>("table")[1];
      if (!grid || !rows) throw new Error("Synthetic SAP lookup grid is missing.");
      const wrapper = document.createElement("div");
      grid.replaceWith(wrapper);
      wrapper.append(grid);
      const scrollbar = document.createElement("div");
      scrollbar.className = "lsScrollbar lsScrollbar--vertical";
      const pageNext = document.createElement("div");
      pageNext.className = "lsScrollbar__track";
      pageNext.setAttribute("acf", "PNext");
      scrollbar.append(pageNext);
      wrapper.append(scrollbar);
      const pages = [
        [["SYN-FGE-03", "Electiva sintética tres"], ["SYN-FGE-04", "Electiva sintética cuatro"]],
        [["SYN-FGE-05", "Electiva sintética cinco"]],
      ] as const;
      let page = 0;
      const clicks = vi.fn(() => {
        const next = pages[page];
        if (!next) return;
        rows.innerHTML = next.map(([code, name]) => `<tr><td>${code}</td><td>${name}</td></tr>`).join("");
        page += 1;
      });
      pageNext.addEventListener("click", clicks);

      const hydration = new AcademicOfferController(document).hydrateLookupResults();
      await vi.runAllTimersAsync();
      await expect(hydration).resolves.toMatchObject({
        status: "expanded",
        options: [
          { index: 0, code: "SYN-FGE-01", name: "Electiva sintética de cultura" },
          { index: 1, code: "SYN-FGE-02", name: "Electiva sintética de sociedad" },
          { index: 2, code: "SYN-FGE-03", name: "Electiva sintética tres" },
          { index: 3, code: "SYN-FGE-04", name: "Electiva sintética cuatro" },
          { index: 4, code: "SYN-FGE-05", name: "Electiva sintética cinco" },
        ],
      });
      expect(clicks).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not click Search when the native input rejects the criterion", async () => {
    const document = fixtureDocument("academic-offer-lookup-initial.html");
    const input = document.querySelector<HTMLInputElement>("input[type='text']");
    const search = document.querySelector<HTMLElement>(".lsButton");
    const searchClick = vi.fn();
    search?.addEventListener("click", searchClick);
    if (!input) throw new Error("Synthetic lookup input is missing.");
    const prototype = Object.getPrototypeOf(input) as object;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    Object.defineProperty(prototype, "value", { configurable: true, get: () => "", set: () => {} });
    try {
      await expect(new AcademicOfferController(document).searchLookup("FGE")).resolves.toBe("not-found");
      expect(searchClick).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(prototype, "value", descriptor);
    }
  });

  it("reopens the native selector before submitting a new lookup query", async () => {
    const document = fixtureDocument("academic-offer-initial.html");
    const helper = document.querySelector<HTMLElement>(".lsField__help--f4");
    const helperClick = vi.fn(() => {
      const lookup = document.createElement("section");
      lookup.innerHTML = `
        <h2>Búsqueda: Código de Asignatura</h2>
        <input type="text" title="Nombre o Código de la asignatura">
        <div class="lsButton" tabindex="0"><span>Buscar</span></div>
        <a href="#">Cerrar</a>`;
      document.body.append(lookup);
    });
    helper?.addEventListener("click", helperClick);

    await expect(new AcademicOfferController(document).searchLookup("psicología"))
      .resolves.toBe("activated");
    const lookupInput = document.querySelector<HTMLInputElement>(
      "input[title='Nombre o Código de la asignatura']",
    );
    expect(helperClick).toHaveBeenCalledOnce();
    expect(lookupInput?.value).toBe("psicología*");
  });

  it("closes a verified lookup result and runs the visible offer search once", async () => {
    const document = fixtureDocument("academic-offer-initial.html");
    const lookup = document.createElement("section");
    lookup.innerHTML = `
      <h2>Búsqueda: Código de Asignatura</h2>
      <input type="text" title="Nombre o Código de la asignatura">
      <a href="#" data-synthetic-close>Cerrar</a>
      <table class="urSTCS">
        <tr><td></td><td><table><tr><th>Abrev. objeto</th><th>Denominación</th></tr></table></td></tr>
        <tr>
          <td><table>
            <tr><td data-synthetic-selector="0" tabindex="0"></td></tr>
            <tr><td data-synthetic-selector="1" tabindex="0"></td></tr>
          </table></td>
          <td><table>
            <tr><td>SYN-FGE-01</td><td>Electiva sintética de cultura</td></tr>
            <tr><td>SYN-FGE-02</td><td>Electiva sintética de sociedad</td></tr>
          </table></td>
        </tr>
      </table>`;
    document.body.append(lookup);
    const firstSelector = lookup.querySelector<HTMLElement>("[data-synthetic-selector='0']");
    const secondSelector = lookup.querySelector<HTMLElement>("[data-synthetic-selector='1']");
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    const closeClick = vi.fn((event: Event) => {
      event.preventDefault();
      lookup.remove();
    });
    firstSelector?.addEventListener("click", firstClick);
    secondSelector?.addEventListener("click", secondClick);
    lookup.querySelector("[data-synthetic-close]")?.addEventListener("click", closeClick);
    const nativeSearch = document.querySelector<HTMLElement>(".lsButton");
    const nativeSearchClick = vi.fn();
    nativeSearch?.addEventListener("click", nativeSearchClick);

    expect(readAcademicOffer(document).lookup).toEqual({
      state: "results",
      options: [
        { index: 0, code: "SYN-FGE-01", name: "Electiva sintética de cultura" },
        { index: 1, code: "SYN-FGE-02", name: "Electiva sintética de sociedad" },
      ],
    });

    await expect(new AcademicOfferController(document).selectLookup({
      index: 1,
      code: "SYN-FGE-02",
      name: "Electiva sintética de sociedad",
    })).resolves.toBe("activated");
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).not.toHaveBeenCalled();
    expect(closeClick).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLInputElement>("input[maxlength='12']")?.value).toBe("SYN-FGE-02");
    expect(nativeSearchClick).toHaveBeenCalledOnce();
  });

  it("runs another exact search from a lookup result kept in memory", async () => {
    const document = fixtureDocument("academic-offer-initial.html");
    const nativeSearch = document.querySelector<HTMLElement>(".lsButton");
    const nativeSearchClick = vi.fn();
    nativeSearch?.addEventListener("click", nativeSearchClick);

    await expect(new AcademicOfferController(document).selectLookup({
      index: 2,
      code: "SYN-FGE-03",
      name: "Electiva sintética conservada",
    })).resolves.toBe("activated");
    expect(document.querySelector<HTMLInputElement>("input[maxlength='12']")?.value)
      .toBe("SYN-FGE-03");
    expect(nativeSearchClick).toHaveBeenCalledOnce();
  });

  it("returns from a result before running another exact search", async () => {
    const document = resultDocumentWithoutSearchControls();
    const initial = fixtureDocument("academic-offer-initial.html");
    const returnAction = document.createElement("div");
    returnAction.tabIndex = 0;
    returnAction.textContent = "Regresar";
    const returnClick = vi.fn(() => {
      document.body.innerHTML = initial.body.innerHTML;
    });
    returnAction.addEventListener("click", returnClick);
    document.body.append(returnAction);

    await expect(new AcademicOfferController(document).search("SYN200")).resolves.toBe("activated");
    expect(returnClick).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLInputElement>("input[maxlength='12']")?.value).toBe("SYN200");
  });

  it("returns from a result before opening a fresh name lookup", async () => {
    const document = resultDocumentWithoutSearchControls();
    const initial = fixtureDocument("academic-offer-initial.html");
    const returnAction = document.createElement("div");
    returnAction.tabIndex = 0;
    returnAction.textContent = "Regresar";
    returnAction.addEventListener("click", () => {
      document.body.innerHTML = initial.body.innerHTML;
      document.querySelector<HTMLElement>(".lsField__help--f4")?.addEventListener("click", () => {
        const lookup = document.createElement("section");
        lookup.innerHTML = `
          <h2>Busqueda: Codigo de Asignatura</h2>
          <input type="text" title="Nombre o Codigo de la asignatura">
          <div class="lsButton" tabindex="0"><span>Buscar</span></div>
          <a href="#">Cerrar</a>`;
        document.body.append(lookup);
      });
    });
    document.body.append(returnAction);

    await expect(new AcademicOfferController(document).searchLookup("psicolog"))
      .resolves.toBe("activated");
    expect(document.querySelector<HTMLInputElement>(
      "input[title='Nombre o Codigo de la asignatura']",
    )?.value).toBe("psicolog*");
  });

  it("returns from a result before selecting another lookup option kept in memory", async () => {
    const document = resultDocumentWithoutSearchControls();
    const initial = fixtureDocument("academic-offer-initial.html");
    const returnAction = document.createElement("div");
    returnAction.tabIndex = 0;
    returnAction.textContent = "Regresar";
    returnAction.addEventListener("click", () => {
      document.body.innerHTML = initial.body.innerHTML;
    });
    document.body.append(returnAction);

    await expect(new AcademicOfferController(document).selectLookup({
      index: 0,
      code: "SYN-FGE-04",
      name: "Electiva sintÃ©tica nueva",
    })).resolves.toBe("activated");
    expect(document.querySelector<HTMLInputElement>("input[maxlength='12']")?.value)
      .toBe("SYN-FGE-04");
  });

  it("ignores a stale hidden native selector when switching persisted results", async () => {
    const document = resultDocumentWithoutSearchControls();
    const initial = fixtureDocument("academic-offer-initial.html");
    const staleLookup = document.createElement("section");
    staleLookup.hidden = true;
    staleLookup.innerHTML = `
      <h2>Busqueda: Codigo de Asignatura</h2>
      <input type="text" title="Nombre o Codigo de la asignatura">
      <div class="lsButton" tabindex="0"><span>Buscar</span></div>
      <a href="#">Cerrar</a>
      <table><tr><th>Abrev. objeto</th><th>Denominacion</th></tr>
        <tr><td>SYN-FGE-05</td><td>Electiva persistida</td></tr></table>`;
    document.body.append(staleLookup);
    const staleClose = vi.fn();
    staleLookup.querySelector("a")?.addEventListener("click", staleClose);

    const returnAction = document.createElement("div");
    returnAction.tabIndex = 0;
    returnAction.textContent = "Regresar";
    returnAction.addEventListener("click", () => {
      document.body.innerHTML = initial.body.innerHTML;
    });
    document.body.append(returnAction);

    await expect(new AcademicOfferController(document).selectLookup({
      index: 0,
      code: "SYN-FGE-05",
      name: "Electiva persistida",
    })).resolves.toBe("activated");
    expect(staleClose).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("input[maxlength='12']")?.value)
      .toBe("SYN-FGE-05");
  });

  it("does not guess when more than one internal return action is visible", async () => {
    const document = resultDocumentWithoutSearchControls();
    const clicks = [vi.fn(), vi.fn()];
    clicks.forEach((listener) => {
      const action = document.createElement("div");
      action.tabIndex = 0;
      action.textContent = "Regresar";
      action.addEventListener("click", listener);
      document.body.append(action);
    });

    await expect(new AcademicOfferController(document).search("SYN200")).resolves.toBe("not-found");
    expect(clicks[0]).not.toHaveBeenCalled();
    expect(clicks[1]).not.toHaveBeenCalled();
  });

  it("rejects invalid input and fails closed when the live action is missing", async () => {
    const document = fixtureDocument("academic-offer-initial.html");
    const controller = new AcademicOfferController(document);
    await expect(controller.search("   ")).resolves.toBe("invalid");
    document.querySelector(".lsButton")?.remove();
    await expect(controller.search("SYN100")).resolves.toBe("not-found");
  });
});
