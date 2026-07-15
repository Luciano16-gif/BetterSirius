import { PORTAL_PATH_PREFIX, SIRIUS_ORIGIN } from "../core/constants";

export function isAllowedRuntimeLocation(location: Pick<Location, "origin" | "pathname">): boolean {
  return location.origin === SIRIUS_ORIGIN && location.pathname.startsWith(PORTAL_PATH_PREFIX);
}

export function assertAllowedRuntimeLocation(
  location: Pick<Location, "origin" | "pathname">,
): void {
  if (!isAllowedRuntimeLocation(location)) {
    throw new Error("BetterSirius refused to start outside the explicit Sirius portal scope.");
  }
}

