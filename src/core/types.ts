export type PortalSurface =
  | "login"
  | "portal-shell"
  | "session-expired"
  | "sap-error"
  | "unsupported";

export type SupportedApplication =
  | "historical-grades"
  | "academic-offer"
  | "registration";

export type ApplicationState =
  | "initial"
  | "results"
  | "empty"
  | "error"
  | "unknown";

export interface DetectionResult<TKind extends string> {
  readonly kind: TKind;
  readonly confidence: number;
  readonly reason: string;
}

export interface DetectedApplication {
  readonly application: SupportedApplication;
  readonly state: ApplicationState;
  readonly confidence: number;
}

export type AcademicProcessGroupId =
  | "enrollment"
  | "term"
  | "requests"
  | "online-courses"
  | "audit-graduation"
  | "student-voice"
  | "teaching-assistants";
export type AcademicProcessMode = "read-only" | "reference" | "blocked";

export interface AcademicProcessItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly mode: AcademicProcessMode;
  readonly detected: boolean;
}

export interface AcademicProcessGroup {
  readonly id: AcademicProcessGroupId;
  readonly label: string;
  readonly description: string;
  readonly processes: readonly AcademicProcessItem[];
}

export interface AcademicProcessesModel {
  readonly groups: readonly AcademicProcessGroup[];
  readonly detectedCount: number;
  readonly totalCount: number;
}

export type AcademicHistoryState = "unavailable" | "initial" | "results" | "empty" | "unknown";

export interface AcademicHistoryCourse {
  readonly code: string;
  readonly name: string;
  readonly period?: string;
  readonly grade?: string;
  readonly approvedCredits?: string;
  readonly attemptedCredits?: string;
  readonly points?: string;
  readonly comments?: string;
}

export interface AcademicHistoryProgram {
  readonly index: number;
  readonly label: string;
}

export interface AcademicHistoryPeriod {
  readonly index: number;
  readonly code: string;
  readonly academicYear: string;
  readonly label: string;
  readonly active: boolean;
}

export interface AcademicHistoryModel {
  readonly state: AcademicHistoryState;
  readonly courses: readonly AcademicHistoryCourse[];
  readonly programs?: readonly AcademicHistoryProgram[];
  readonly periods?: readonly AcademicHistoryPeriod[];
  readonly pending?: AcademicHistoryPending;
}

export type AcademicHistoryPending = "opening" | "program" | "period";

export interface ShellModel {
  readonly portalState: Exclude<PortalSurface, "unsupported" | "login">;
  readonly applications: readonly DetectedApplication[];
  readonly academicProcesses: AcademicProcessesModel;
  readonly academicHistory: AcademicHistoryModel;
}
