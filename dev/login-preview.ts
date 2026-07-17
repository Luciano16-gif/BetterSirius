import { mountBetterSiriusLogin } from "../src/login/login-shell";

const parameters = new URLSearchParams(window.location.search);
const form = document.querySelector<HTMLFormElement>("form");
const result = document.querySelector<HTMLOutputElement>("#synthetic-login-result");

if (parameters.get("state") === "error") {
  const error = document.createElement("p");
  error.textContent = "Usuario o clave incorrecta";
  form?.before(error);
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (result) result.textContent = "Formulario nativo activado";
});

const controller = mountBetterSiriusLogin(document);
if (parameters.get("mode") === "original") controller?.showOriginal();
