import { describe, expect, it } from "vitest";
import { readRegistrationWindow } from "../src/academic/registration-window";
import { fixtureDocument } from "./helpers/fixture";

describe("registration window", () => {
  it("reads only the four scheduling values from a sanitized fixture", () => {
    expect(readRegistrationWindow(fixtureDocument("registration-window-results.html"))).toEqual({
      state: "results",
      startDate: "31.08.2099",
      startTime: "19:00:00",
      endDate: "01.09.2099",
      endTime: "24:00:00",
    });
  });

  it("fails closed when a recognizable response is incomplete", () => {
    const document = new DOMParser().parseFromString(
      "<h1>Turno de Inscripción</h1><p>Fecha de inicio: 31.08.2099</p>",
      "text/html",
    );
    expect(readRegistrationWindow(document)).toEqual({ state: "unknown" });
  });

  it("does not interpret unrelated documents", () => {
    const document = new DOMParser().parseFromString("<main>Contenido sintético</main>", "text/html");
    expect(readRegistrationWindow(document)).toEqual({ state: "unavailable" });
  });
});
