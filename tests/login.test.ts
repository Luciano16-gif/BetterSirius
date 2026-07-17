import { describe, expect, it, vi } from "vitest";
import { mountBetterSiriusLogin } from "../src/login/login-shell";
import { fixtureDocument } from "./helpers/fixture";

describe("responsive login shell", () => {
  it("reuses the native fields and native submit control without cloning them", () => {
    const loginDocument = fixtureDocument("login.html");
    const form = loginDocument.querySelector<HTMLFormElement>("form");
    const username = loginDocument.querySelector<HTMLInputElement>('input[autocomplete="username"]');
    const password = loginDocument.querySelector<HTMLInputElement>('input[type="password"]');
    const submit = loginDocument.querySelector<HTMLInputElement>('input[type="submit"]');
    if (!form || !username || !password || !submit) throw new Error("Synthetic login fixture is incomplete.");
    const submitted = vi.fn((event: SubmitEvent) => event.preventDefault());
    form.addEventListener("submit", submitted);

    const controller = mountBetterSiriusLogin(loginDocument);
    const shell = form.querySelector("[data-better-sirius-login-shell]");

    expect(controller).not.toBeNull();
    expect(shell?.contains(username)).toBe(true);
    expect(shell?.contains(password)).toBe(true);
    expect(shell?.contains(submit)).toBe(true);
    expect(loginDocument.querySelectorAll('input[autocomplete="username"]')).toHaveLength(1);
    expect(username.getAttribute("autocomplete")).toBe("username");
    expect(password.getAttribute("autocomplete")).toBe("current-password");

    submit.click();
    expect(submitted).toHaveBeenCalledOnce();
    controller?.dispose();
  });

  it("restores the untouched login controls when Sirius original is requested", () => {
    const loginDocument = fixtureDocument("login.html");
    const form = loginDocument.querySelector<HTMLFormElement>("form");
    const username = loginDocument.querySelector<HTMLInputElement>('input[autocomplete="username"]');
    const originalParent = username?.parentElement;
    if (!form || !username || !originalParent) throw new Error("Synthetic login fixture is incomplete.");

    const controller = mountBetterSiriusLogin(loginDocument);
    expect(loginDocument.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(
      "width=device-width, initial-scale=1, viewport-fit=cover",
    );
    loginDocument.querySelector<HTMLButtonElement>(".bs-login-original")?.click();

    expect(loginDocument.body.dataset.betterSiriusLoginMode).toBe("original");
    expect(username.parentElement).toBe(originalParent);
    expect(username.classList.contains("bs-login-native-input")).toBe(false);
    expect(form.querySelector<HTMLElement>("[data-better-sirius-login-shell]")?.hidden).toBe(true);
    expect(loginDocument.querySelector('meta[name="viewport"]')).toBeNull();

    loginDocument.querySelector<HTMLButtonElement>(".bs-login-return")?.click();
    expect(loginDocument.body.dataset.betterSiriusLoginMode).toBe("enhanced");
    expect(form.querySelector("[data-better-sirius-login-shell]")?.contains(username)).toBe(true);
    expect(loginDocument.querySelector('meta[name="viewport"]')).not.toBeNull();
    controller?.dispose();
    expect(loginDocument.querySelector('meta[name="viewport"]')).toBeNull();
  });

  it("restores an existing Sirius viewport declaration exactly", () => {
    const loginDocument = fixtureDocument("login.html");
    const viewport = loginDocument.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=1024";
    loginDocument.head.append(viewport);

    const controller = mountBetterSiriusLogin(loginDocument);
    expect(viewport.content).toBe("width=device-width, initial-scale=1, viewport-fit=cover");

    loginDocument.querySelector<HTMLButtonElement>(".bs-login-original")?.click();
    expect(viewport.content).toBe("width=1024");

    controller?.dispose();
    expect(viewport.content).toBe("width=1024");
  });

  it("shows only a fixed safe message for a recognized login rejection", () => {
    const loginDocument = fixtureDocument("login-error.html");
    const controller = mountBetterSiriusLogin(loginDocument);

    expect(loginDocument.querySelector("[role='alert']")?.textContent).toBe(
      "Sirius no aceptó esas credenciales. Revisa los datos e inténtalo nuevamente.",
    );
    controller?.dispose();
  });

  it("fails open when no native login action can be identified", () => {
    const loginDocument = new DOMParser().parseFromString(
      '<form><input type="text"><input type="password"></form>',
      "text/html",
    );
    const password = loginDocument.querySelector("input[type='password']");

    expect(mountBetterSiriusLogin(loginDocument)).toBeNull();
    expect(password?.closest("form")?.querySelector("[data-better-sirius-login-shell]")).toBeNull();
  });
});
