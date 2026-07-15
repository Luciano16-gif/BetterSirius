import { describe, expect, it, vi } from "vitest";
import { AcademicNavigator } from "../src/navigation/academic-navigator";

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
