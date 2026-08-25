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

  if (current.pending === "searching") {
    return {
      ...current,
      ...(lookup ? { lookup } : {}),
    };
  }

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
    const sameQuery = normalizedQuery(current?.query) === normalizedQuery(observed?.query);
    return observed
      ? {
          ...observed,
          ...(!observed.query && current?.query ? { query: current.query } : {}),
          ...(sameQuery && current?.state === "results" && observed.state === "results"
            ? { options: mergeLookupOptions(current.options, observed.options) }
            : {}),
        }
      : current && (current.state === "results" || current.state === "empty")
        ? current
        : undefined;
  }

  if (current.pending === "searching") return current;
  if (!observed || !lookupOperationSettled(current.pending, observed)) return current;
  return {
    ...observed,
    ...(current.query ? { query: current.query } : {}),
  };
}

function normalizedQuery(value: string | undefined): string {
  return (value ?? "").replace(/[?*]+$/g, "").trim().toLocaleLowerCase("es");
}

function mergeLookupOptions(
  current: AcademicOfferLookupModel["options"],
  observed: AcademicOfferLookupModel["options"],
): AcademicOfferLookupModel["options"] {
  const unique = new Map<string, AcademicOfferLookupModel["options"][number]>();
  for (const option of [...current, ...observed]) {
    const key = `${option.code}\u0000${option.name}`;
    if (!unique.has(key)) unique.set(key, option);
  }
  return Array.from(unique.values(), (option, index) => ({ ...option, index }));
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
