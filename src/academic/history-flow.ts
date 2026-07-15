import type {
  AcademicHistoryModel,
  AcademicHistoryPending,
} from "../core/types";

interface PendingOperation {
  readonly kind: AcademicHistoryPending;
  readonly targetPeriodCode?: string;
}

export class AcademicHistoryFlow {
  #pending: PendingOperation | null = null;
  #lastStable: AcademicHistoryModel;
  #lastObserved: AcademicHistoryModel;

  constructor(initial: AcademicHistoryModel) {
    this.#lastStable = withoutPending(initial);
    this.#lastObserved = withoutPending(initial);
  }

  begin(
    kind: AcademicHistoryPending,
    current: AcademicHistoryModel,
    targetPeriodCode?: string,
  ): AcademicHistoryModel {
    this.#lastStable = withoutPending(current);
    this.#pending = targetPeriodCode ? { kind, targetPeriodCode } : { kind };
    return { ...this.#lastStable, pending: kind };
  }

  reconcile(observed: AcademicHistoryModel): AcademicHistoryModel {
    this.#lastObserved = withoutPending(observed);
    if (!this.#pending) {
      this.#lastStable = this.#lastObserved;
      return this.#lastObserved;
    }

    if (operationSettled(this.#pending, this.#lastObserved)) {
      this.#pending = null;
      this.#lastStable = this.#lastObserved;
      return this.#lastObserved;
    }

    return { ...this.#lastStable, pending: this.#pending.kind };
  }

  expire(): AcademicHistoryModel {
    this.#pending = null;
    this.#lastStable = this.#lastObserved;
    return this.#lastObserved;
  }
}

function operationSettled(operation: PendingOperation, model: AcademicHistoryModel): boolean {
  if (operation.kind === "opening") {
    return model.state === "initial" || model.state === "results" || model.state === "empty";
  }
  if (operation.kind === "program") {
    return model.state === "results" || model.state === "empty";
  }
  if (model.state !== "results" && model.state !== "empty") return false;
  return model.periods?.some((period) =>
    period.active && period.code === operation.targetPeriodCode,
  ) ?? false;
}

function withoutPending(model: AcademicHistoryModel): AcademicHistoryModel {
  const { pending: _pending, ...stable } = model;
  return stable;
}
