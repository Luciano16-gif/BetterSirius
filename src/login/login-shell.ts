import { normalizedText } from "../detection/text";
import { createResponsiveViewport } from "../ui/responsive-viewport";
import { LOGIN_STYLES } from "./login-styles";

const LOGIN_STYLE_ID = "better-sirius-login-style";
const LOGIN_SHELL_ATTRIBUTE = "data-better-sirius-login-shell";

type NativeLoginControl = HTMLInputElement | HTMLButtonElement;

interface ControlBookmark {
  readonly control: NativeLoginControl;
  readonly marker: Comment;
}

export interface LoginShellController {
  showOriginal(): void;
  showEnhanced(): void;
  dispose(): void;
}

export function mountBetterSiriusLogin(document: Document): LoginShellController | null {
  const password = document.querySelector<HTMLInputElement>('input[type="password"]');
  const form = password?.closest<HTMLFormElement>("form") ?? null;
  if (!password || !form || !document.body || !document.head) return null;

  const username = findUsernameInput(form, password);
  const submit = findNativeLoginAction(form);
  if (!username || !submit) return null;

  document.getElementById(LOGIN_STYLE_ID)?.remove();
  form.querySelector(`[${LOGIN_SHELL_ATTRIBUTE}]`)?.remove();

  const bookmarks = [bookmark(username), bookmark(password), bookmark(submit)];
  const responsiveViewport = createResponsiveViewport(document);
  const view = buildLoginView(document);
  const style = document.createElement("style");
  style.id = LOGIN_STYLE_ID;
  style.textContent = LOGIN_STYLES;

  const returnButton = element(document, "button", "bs-login-return", "Volver a BetterSirius");
  returnButton.type = "button";
  returnButton.hidden = true;

  form.append(view.shell);
  document.head.append(style);
  document.documentElement.append(returnButton);

  const showEnhanced = (): void => {
    responsiveViewport.activate();
    username.classList.add("bs-login-native-input");
    password.classList.add("bs-login-native-input");
    submit.classList.add("bs-login-native-submit");
    view.usernameSlot.append(username);
    view.passwordSlot.append(password);
    view.submitSlot.append(submit);
    view.shell.hidden = false;
    returnButton.hidden = true;
    form.setAttribute("data-better-sirius-login-form", "enhanced");
    document.body.dataset.betterSiriusLoginMode = "enhanced";
    username.focus({ preventScroll: true });
  };

  const showOriginal = (): void => {
    responsiveViewport.deactivate();
    restoreControls(bookmarks);
    username.classList.remove("bs-login-native-input");
    password.classList.remove("bs-login-native-input");
    submit.classList.remove("bs-login-native-submit");
    view.shell.hidden = true;
    returnButton.hidden = false;
    form.setAttribute("data-better-sirius-login-form", "original");
    document.body.dataset.betterSiriusLoginMode = "original";
  };

  view.originalButton.addEventListener("click", showOriginal);
  returnButton.addEventListener("click", showEnhanced);
  showEnhanced();

  return {
    showOriginal,
    showEnhanced,
    dispose(): void {
      responsiveViewport.dispose();
      restoreControls(bookmarks);
      view.originalButton.removeEventListener("click", showOriginal);
      returnButton.removeEventListener("click", showEnhanced);
      username.classList.remove("bs-login-native-input");
      password.classList.remove("bs-login-native-input");
      submit.classList.remove("bs-login-native-submit");
      form.removeAttribute("data-better-sirius-login-form");
      delete document.body.dataset.betterSiriusLoginMode;
      for (const saved of bookmarks) saved.marker.remove();
      view.shell.remove();
      returnButton.remove();
      style.remove();
    },
  };
}

function findUsernameInput(form: HTMLFormElement, password: HTMLInputElement): HTMLInputElement | null {
  const candidates = Array.from(form.querySelectorAll<HTMLInputElement>("input")).filter((input) => {
    const type = (input.getAttribute("type") ?? "text").toLocaleLowerCase("en");
    return input !== password && ["text", "email", "tel"].includes(type) && !input.disabled;
  });
  return candidates.at(-1) ?? null;
}

function findNativeLoginAction(form: HTMLFormElement): NativeLoginControl | null {
  const candidates = Array.from(
    form.querySelectorAll<NativeLoginControl>('button, input[type="submit"], input[type="button"], input[type="image"]'),
  );
  const exact = candidates.find((control) => normalizedText(controlLabel(control)) === "entrar al sistema");
  if (exact) return exact;
  return candidates.find((control) => {
    if (control instanceof HTMLButtonElement) {
      return (control.getAttribute("type") ?? "submit").toLocaleLowerCase("en") === "submit";
    }
    return ["submit", "image"].includes((control.getAttribute("type") ?? "").toLocaleLowerCase("en"));
  }) ?? null;
}

function controlLabel(control: NativeLoginControl): string {
  return control instanceof HTMLButtonElement
    ? control.textContent ?? ""
    : control.getAttribute("value") ?? control.getAttribute("alt") ?? "";
}

function bookmark(control: NativeLoginControl): ControlBookmark {
  const marker = control.ownerDocument.createComment("BetterSirius native login control");
  control.before(marker);
  return { control, marker };
}

function restoreControls(bookmarks: readonly ControlBookmark[]): void {
  for (const { control, marker } of bookmarks) {
    marker.parentNode?.insertBefore(control, marker.nextSibling);
  }
}

interface LoginView {
  readonly shell: HTMLElement;
  readonly usernameSlot: HTMLElement;
  readonly passwordSlot: HTMLElement;
  readonly submitSlot: HTMLElement;
  readonly originalButton: HTMLButtonElement;
}

function buildLoginView(document: Document): LoginView {
  const shell = element(document, "section", "bs-login-shell");
  shell.setAttribute(LOGIN_SHELL_ATTRIBUTE, "");

  const story = element(document, "section", "bs-login-story");
  const brand = element(document, "div", "bs-login-brand");
  brand.append(
    element(document, "span", "bs-login-brand-mark", "B"),
    element(document, "strong", "", "BetterSirius"),
  );
  const storyCopy = element(document, "div", "bs-login-story-copy");
  storyCopy.append(
    element(document, "span", "bs-login-story-eyebrow", "UNIMET · PORTAL ESTUDIANTIL"),
    element(document, "h1", "", "Tu vida académica, más fácil de consultar."),
    element(
      document,
      "p",
      "",
      "Una interfaz clara y adaptable sobre Sirius, manteniendo SAP como fuente oficial.",
    ),
  );
  story.append(brand, storyCopy, element(document, "span", "bs-login-edition", "MVP · SOLO LECTURA"));

  const entry = element(document, "section", "bs-login-entry");
  const originalButton = element(document, "button", "bs-login-original", "Ver Sirius original");
  originalButton.type = "button";
  const card = element(document, "div", "bs-login-card");
  card.append(
    element(document, "span", "bs-login-eyebrow", "ACCESO A SIRIUS"),
    element(document, "h2", "", "Inicia sesión"),
    element(document, "p", "bs-login-intro", "Usa las mismas credenciales de tu cuenta estudiantil."),
  );

  const knownError = knownLoginError(document);
  if (knownError) {
    const alert = element(document, "p", "bs-login-error", knownError);
    alert.setAttribute("role", "alert");
    card.append(alert);
  }

  const usernameField = element(document, "label", "bs-login-field");
  usernameField.append(element(document, "span", "", "Usuario"));
  const usernameSlot = element(document, "span", "bs-login-control-slot");
  usernameField.append(usernameSlot);

  const passwordField = element(document, "label", "bs-login-field");
  passwordField.append(element(document, "span", "", "Clave de acceso"));
  const passwordSlot = element(document, "span", "bs-login-control-slot");
  passwordField.append(passwordSlot);

  const submitSlot = element(document, "div", "bs-login-submit-slot");
  card.append(
    usernameField,
    passwordField,
    submitSlot,
    element(document, "p", "bs-login-privacy", "BetterSirius no lee ni guarda tu clave."),
  );
  entry.append(originalButton, card);
  shell.append(story, entry);
  return { shell, usernameSlot, passwordSlot, submitSlot, originalButton };
}

function knownLoginError(document: Document): string | null {
  const text = normalizedText(document.body?.textContent);
  const patterns = [
    "usuario o clave incorrecta",
    "usuario o contrasena incorrecta",
    "autenticacion fallida",
    "authentication failed",
    "logon failed",
  ];
  return patterns.some((pattern) => text.includes(pattern))
    ? "Sirius no aceptó esas credenciales. Revisa los datos e inténtalo nuevamente."
    : null;
}

function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
