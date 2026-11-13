import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcademicOfferController, readAcademicOffer } from "../src/academic/offer";
import { fixtureDocument } from "./helpers/fixture";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("academic search response freshness", () => {
  it("ignores unrelated loading changes and rejects rows for the previous course", async () => {
    const document = fixtureDocument("academic-offer-results.html");
    document.querySelector(".lsButton")!.addEventListener("click", () => {
      document.body.append(document.createElement("div"));
    });
    const controller = new AcademicOfferController(document);
    await controller.search("SYN200");
    const hydration = controller.hydrateSearchResults();
    const resolved = vi.fn();
    void hydration.then(resolved);
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).not.toHaveBeenCalled();

    const firstRow = document.querySelectorAll("table tr")[1]!;
    firstRow.children[8]!.textContent = "20";
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).not.toHaveBeenCalled();

    firstRow.children[1]!.textContent = "SYN200";
    await vi.runAllTimersAsync();
    await expect(hydration).resolves.toMatchObject({
      status: "complete",
      offer: { offerings: [{ code: "SYN200" }, { code: "SYN200" }] },
    });
  });

  it.each(["SYN1*", "SYN10?", "SYN100"])("accepts a fresh response matching %s", async (query) => {
    const document = fixtureDocument("academic-offer-results.html");
    document.querySelector(".lsButton")!.addEventListener("click", () => {
      document.querySelectorAll("table tr")[1]!.children[8]!.textContent = "20";
    });
    const controller = new AcademicOfferController(document);
    await controller.search(query);
    await expect(controller.hydrateSearchResults()).resolves.toMatchObject({ status: "complete" });
  });

  it.each(["FGE", "MAT"])("waits for the lookup table to rerender when searching %s", async (query) => {
    const document = fixtureDocument("academic-offer-lookup-results.html");
    document.querySelector("input")!.value = "FGE*";
    document.querySelector(".lsButton")!.addEventListener("click", () => {
      document.body.append(document.createElement("div"));
    });
    const controller = new AcademicOfferController(document);
    await controller.searchLookup(query);
    const hydration = controller.hydrateLookupResults();
    const resolved = vi.fn();
    void hydration.then(resolved);
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).not.toHaveBeenCalled();
    const rows = document.querySelectorAll("table.urSTCS table")[1]!;
    rows.innerHTML = rows.innerHTML;
    await vi.runAllTimersAsync();
    await expect(hydration).resolves.toMatchObject({ status: "complete" });
  });

  it("does not complete a repeated lookup when no response arrives", async () => {
    const document = fixtureDocument("academic-offer-lookup-results.html");
    document.querySelector("input")!.value = "FGE*";
    const controller = new AcademicOfferController(document);
    await controller.searchLookup("FGE");
    const hydration = controller.hydrateLookupResults();
    await vi.runAllTimersAsync();
    await expect(hydration).resolves.toEqual({ status: "stale", options: [] });
  });

  it("selects an earlier collected page after native rows have been replaced", async () => {
    const document = fixtureDocument("academic-offer-lookup-results.html");
    const grid = document.querySelector("table.urSTCS")!;
    const rows = grid.querySelectorAll("table")[1]!;
    const wrapper = document.createElement("div");
    grid.replaceWith(wrapper);
    wrapper.append(grid);
    const scrollbar = document.createElement("div");
    scrollbar.className = "lsScrollbar--vertical";
    scrollbar.innerHTML = '<div acf="PNext"></div>';
    wrapper.append(scrollbar);
    scrollbar.firstElementChild!.addEventListener("click", () => {
      rows.innerHTML = "<tr><td>SYN300</td><td>Final page</td></tr>";
    });
    const search = vi.fn();
    document.querySelector("a")!.addEventListener("click", (event) => {
      event.preventDefault();
      const initial = fixtureDocument("academic-offer-initial.html");
      document.title = initial.title;
      document.body.innerHTML = initial.body.innerHTML;
      document.querySelector(".lsButton")!.addEventListener("click", search);
    });
    const controller = new AcademicOfferController(document);
    const hydration = controller.hydrateLookupResults();
    await vi.runAllTimersAsync();
    const result = await hydration;
    expect(result.options).toHaveLength(3);
    await expect(controller.selectLookup(result.options[0]!)).resolves.toBe("activated");
    expect(document.querySelector("input")!.value).toBe("SYN-FGE-01");
    expect(search).toHaveBeenCalledOnce();
    await expect(controller.selectLookup(result.options[1]!)).resolves.toBe("activated");
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("invalidates collected options when another lookup starts or the selector closes", async () => {
    const document = fixtureDocument("academic-offer-lookup-results.html");
    const controller = new AcademicOfferController(document);
    const previous = await controller.hydrateLookupResults();
    document.querySelector(".lsButton")!.addEventListener("click", () => {
      document.querySelectorAll("table.urSTCS table")[1]!.innerHTML = "<tr><td>MAT100</td><td>New query</td></tr>";
    });
    await controller.searchLookup("MAT");
    await controller.hydrateLookupResults();
    await expect(controller.selectLookup(previous.options[0]!)).resolves.toBe("not-found");
    document.querySelector("a")!.addEventListener("click", (event) => {
      event.preventDefault();
      document.body.innerHTML = fixtureDocument("academic-offer-initial.html").body.innerHTML;
    });
    expect(controller.closeLookup()).toBe("activated");
    await expect(controller.selectLookup(previous.options[0]!)).resolves.toBe("not-found");
  });

  it("keeps native lookup results selectable after switching to a direct search", async () => {
    const document = fixtureDocument("academic-offer-initial.html");
    const lookup = document.createElement("section");
    lookup.innerHTML = fixtureDocument("academic-offer-lookup-results.html").body.innerHTML;
    document.body.append(lookup);
    lookup.querySelector("a")!.addEventListener("click", (event) => {
      event.preventDefault();
      lookup.remove();
    });
    const selection = readAcademicOffer(document).lookup!.options[0]!;
    const search = vi.fn();
    document.querySelector(".lsButton")!.addEventListener("click", search);
    const controller = new AcademicOfferController(document);
    await expect(controller.search("SYN100")).resolves.toBe("activated");
    await expect(controller.selectLookup(selection)).resolves.toBe("activated");
    expect(search).toHaveBeenCalledTimes(2);
    expect(document.querySelector("input")!.value).toBe(selection.code);
  });

  it("stops after one automatic retry when SAP fails again", async () => {
    const document = fixtureDocument("academic-offer-initial.html");
    let searches = 0;
    const fail = (): void => {
      searches += 1;
      document.title = "500 Internal Server Error";
      document.body.innerHTML = "<h1>500 Internal Server Error</h1>";
    };
    document.querySelector(".lsButton")!.addEventListener("click", fail);
    const recover = vi.fn(async () => {
      const initial = fixtureDocument("academic-offer-initial.html");
      document.title = initial.title;
      document.body.innerHTML = initial.body.innerHTML;
      document.querySelector(".lsButton")!.addEventListener("click", fail);
      return "activated" as const;
    });
    const controller = new AcademicOfferController(document, recover);
    await controller.search("SYN100");
    await expect(controller.hydrateSearchResults()).resolves.toMatchObject({ offer: { state: "error" } });
    expect(searches).toBe(2);
    expect(recover).toHaveBeenCalledOnce();
  });
});
