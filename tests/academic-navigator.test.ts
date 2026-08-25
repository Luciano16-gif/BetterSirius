import { describe, expect, it, vi } from "vitest";
import { AcademicNavigator } from "../src/navigation/academic-navigator";
import { FinancialNavigator } from "../src/navigation/financial-navigator";

describe("read-only academic navigator", () => {
  it("traverses the synthetic portal hierarchy and activates historical grades once", async () => {
    const navigation = document.createElement("nav");
    document.body.append(navigation);
    const activated = vi.fn();

    const addStep = (label: string, next?: () => void): void => {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => {
        button.remove();
        next?.();
      });
      navigation.append(button);
    };
    addStep("Procesos Académicos", () =>
      addStep("Pregrado", () =>
        addStep("Consultas y Solicitudes", () =>
          addStep("Consulta Calificaciones Históricas", activated),
        ),
      ),
    );

    const result = await new AcademicNavigator(document).openHistoricalGrades();

    expect(result).toBe("activated");
    expect(activated).toHaveBeenCalledOnce();
  });

  it("traverses the synthetic portal hierarchy and activates period grades once", async () => {
    const navigation = document.createElement("nav");
    document.body.append(navigation);
    const activated = vi.fn();

    const addStep = (label: string, next?: () => void): void => {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => {
        button.remove();
        next?.();
      });
      navigation.append(button);
    };
    addStep("Procesos Académicos", () =>
      addStep("Pregrado", () =>
        addStep("Consultas y Solicitudes", () =>
          addStep("Consulta de Calificaciones Período", activated),
        ),
      ),
    );

    const result = await new AcademicNavigator(document).openPeriodGrades();

    expect(result).toBe("activated");
    expect(activated).toHaveBeenCalledOnce();
  });

  it("traverses Matrícula Pregrado and activates Oferta Académica once", async () => {
    const navigation = document.createElement("nav");
    document.body.append(navigation);
    const activated = vi.fn();
    const addStep = (label: string, next?: () => void): void => {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => {
        button.remove();
        next?.();
      });
      navigation.append(button);
    };
    addStep("Procesos Académicos", () =>
      addStep("Pregrado", () =>
        addStep("Matrícula Pregrado", () =>
          addStep("Oferta Académica", activated),
        ),
      ),
    );

    await expect(new AcademicNavigator(document).openAcademicOffer()).resolves.toBe("activated");
    expect(activated).toHaveBeenCalledOnce();
  });

  it("traverses Matrícula Pregrado and activates Turno de Inscripción once", async () => {
    const navigation = document.createElement("nav");
    document.body.append(navigation);
    const activated = vi.fn();
    const addStep = (label: string, next?: () => void): void => {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => {
        button.remove();
        next?.();
      });
      navigation.append(button);
    };
    addStep("Procesos Académicos", () =>
      addStep("Pregrado", () =>
        addStep("Matrícula Pregrado", () =>
          addStep("Turno de Inscripción", activated),
        ),
      ),
    );

    await expect(new AcademicNavigator(document).openRegistrationWindow()).resolves.toBe("activated");
    expect(activated).toHaveBeenCalledOnce();
  });

  it("fails closed when the target is absent", async () => {
    document.body.innerHTML = "<button>Proceso desconocido</button>";
    await expect(new AcademicNavigator(document).openHistoricalGrades()).resolves.toBe("not-found");
  });

  it("activates one deterministic target when Sirius renders duplicate exact controls", async () => {
    const first = document.createElement("button");
    const second = document.createElement("button");
    first.textContent = second.textContent = "Consulta Calificaciones Históricas";
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    first.addEventListener("click", firstAction);
    second.addEventListener("click", secondAction);
    document.body.replaceChildren(first, second);

    await expect(new AcademicNavigator(document).openHistoricalGrades()).resolves.toBe("activated");
    expect(firstAction).toHaveBeenCalledOnce();
    expect(secondAction).not.toHaveBeenCalled();
  });
});

describe("read-only financial navigator", () => {
  it("opens Web de Pagos through the observed administrative hierarchy", async () => {
    const navigation = document.createElement("nav");
    document.body.replaceChildren(navigation);
    const activated = vi.fn();
    const administrative = document.createElement("button");
    administrative.textContent = "Procesos Administrativos";
    administrative.addEventListener("click", () => {
      administrative.remove();
      const payments = document.createElement("button");
      payments.textContent = "Web de Pagos";
      payments.addEventListener("click", activated);
      navigation.append(payments);
    });
    navigation.append(administrative);

    await expect(new FinancialNavigator(document).openWebPayments()).resolves.toBe("activated");
    expect(activated).toHaveBeenCalledOnce();
  });

  it("opens the exact visible message-list control and no other action", async () => {
    const list = document.createElement("button");
    const paymentMethod = document.createElement("button");
    list.textContent = "Visualizar lista";
    paymentMethod.textContent = "Pagar";
    const listAction = vi.fn();
    const paymentAction = vi.fn();
    list.addEventListener("click", listAction);
    paymentMethod.addEventListener("click", paymentAction);
    document.body.replaceChildren(list, paymentMethod);

    await expect(new FinancialNavigator(document).openMessages()).resolves.toBe("activated");
    expect(listAction).toHaveBeenCalledOnce();
    expect(paymentAction).not.toHaveBeenCalled();
  });
});
