import type {
  ApplicationState,
  DetectionResult,
  SupportedApplication,
} from "../core/types";

export type ReadOnlyAction = "select-view" | "refresh-view";

export interface AdapterError {
  readonly kind: "session-expired" | "server-error" | "invalid-state" | "unknown";
  readonly recoverable: boolean;
  readonly message: string;
}

export interface SapApplicationAdapter<TState> {
  readonly application: SupportedApplication;
  detect(document: Document): DetectionResult<SupportedApplication> | null;
  readState(document: Document): TState;
  locateAction(document: Document, action: ReadOnlyAction): Element | null;
  classifyError(document: Document): AdapterError | null;
}

export interface ReadOnlyApplicationState {
  readonly state: ApplicationState;
}

