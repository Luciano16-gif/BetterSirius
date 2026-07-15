import { describe, expect, it } from "vitest";
import {
  applicationFromUrl,
  detectApplication,
} from "../src/detection/application-detector";
import { detectPortalSurface } from "../src/detection/portal-detector";
import { fixtureDocument } from "./helpers/fixture";

describe("portal detection", () => {
  it.each([
    ["portal-shell.html", "portal-shell"],
    ["login.html", "login"],
    ["session-expired.html", "session-expired"],
    ["sap-error.html", "sap-error"],
  ] as const)("classifies %s as %s", (fixture, expected) => {
    expect(detectPortalSurface(fixtureDocument(fixture)).kind).toBe(expected);
  });

  it("fails closed for an unknown document", () => {
    const unknown = new DOMParser().parseFromString("<main>Unrelated page</main>", "text/html");
    expect(detectPortalSurface(unknown)).toMatchObject({ kind: "unsupported", confidence: 0 });
  });
});

describe("application detection", () => {
  it.each([
    ["historical-grades-initial.html", "historical-grades", "initial"],
    ["historical-grades-results.html", "historical-grades", "results"],
    ["academic-offer-initial.html", "academic-offer", "initial"],
    ["registration-initial.html", "registration", "initial"],
  ] as const)("recognizes %s without generated SAP IDs", (fixture, application, state) => {
    expect(detectApplication(fixtureDocument(fixture))).toMatchObject({ application, state });
  });

  it("reduces a session-shaped URL to a known application fingerprint", () => {
    expect(
      applicationFromUrl(
        "/sap/bc/webdynpro/sap/zweb_oferta_1;synthetic-transport-fragment",
        "http://sirius.unimet.edu.ve/irj/portal",
      ),
    ).toBe("academic-offer");
  });

  it("does not inspect application paths on a third-party origin", () => {
    expect(
      applicationFromUrl(
        "https://payments.invalid/sap/bc/webdynpro/sap/zweb_oferta_1",
        "http://sirius.unimet.edu.ve/irj/portal",
      ),
    ).toBeNull();
  });
});

