import type {
  AcademicOfferLookupModel,
  AcademicOfferModel,
} from "../core/types";

export function reconcileAcademicOffer(
  current: AcademicOfferModel,
  observed: AcademicOfferModel,
): AcademicOfferModel {
  const lookup = reconcileLookup(current.lookup, observed.lookup);
  const withContext: AcademicOfferModel = {
    ...observed,
    ...(current.query ? { query: current.query } : {}),
    ...(lookup ? { lookup } : {}),
  };

  if (current.pending && !offerOperationSettled(current.pending, observed)) {
    return {
      ...current,
      ...(lookup ? { lookup } : {}),
    };
  }

  return withContext;
}

function reconcileLookup(
  current: AcademicOfferLookupModel | undefined,
  observed: AcademicOfferLookupModel | undefined,
): AcademicOfferLookupModel | undefined {
  if (!current?.pending) {
    return observed
      ? { ...observed, ...(current?.query ? { query: current.query } : {}) }
      : current && (current.state === "results" || current.state === "empty")
        ? current
        : undefined;
  }

  if (!observed || !lookupOperationSettled(current.pending, observed)) return current;
  return {
    ...observed,
    ...(current.query ? { query: current.query } : {}),
  };
}

function offerOperationSettled(
  pending: NonNullable<AcademicOfferModel["pending"]>,
  observed: AcademicOfferModel,
): boolean {
  if (pending === "opening") {
    return observed.state === "initial" || observed.state === "results" || observed.state === "empty";
  }
  return observed.state === "results" || observed.state === "empty";
}

function lookupOperationSettled(
  pending: NonNullable<AcademicOfferLookupModel["pending"]>,
  observed: AcademicOfferLookupModel,
): boolean {
  if (pending === "opening") {
    return observed.state === "initial" || observed.state === "results" || observed.state === "empty";
  }
  return observed.state === "results" || observed.state === "empty";
}
