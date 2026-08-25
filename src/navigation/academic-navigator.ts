import { ReadOnlyPathNavigator, type ReadOnlyNavigationResult } from "./read-only-navigator";

export type { ReadOnlyNavigationResult } from "./read-only-navigator";

const HISTORICAL_GRADES_PATH = [
  "Procesos Académicos",
  "Pregrado",
  "Consultas y Solicitudes",
  "Consulta Calificaciones Históricas",
] as const;

const PERIOD_GRADES_PATH = [
  "Procesos Académicos",
  "Pregrado",
  "Consultas y Solicitudes",
  "Consulta de Calificaciones Período",
] as const;

const ACADEMIC_OFFER_PATH = [
  "Procesos Académicos",
  "Pregrado",
  "Matrícula Pregrado",
  "Oferta Académica",
] as const;

const REGISTRATION_WINDOW_PATH = [
  "Procesos Académicos",
  "Pregrado",
  "Matrícula Pregrado",
  "Turno de Inscripción",
] as const;

export class AcademicNavigator {
  readonly #navigator: ReadOnlyPathNavigator;

  constructor(rootDocument: Document) {
    this.#navigator = new ReadOnlyPathNavigator(rootDocument);
  }

  async openHistoricalGrades(): Promise<ReadOnlyNavigationResult> {
    return this.#navigator.open(HISTORICAL_GRADES_PATH);
  }

  async openPeriodGrades(): Promise<ReadOnlyNavigationResult> {
    return this.#navigator.open(PERIOD_GRADES_PATH);
  }

  async openAcademicOffer(): Promise<ReadOnlyNavigationResult> {
    return this.#navigator.open(ACADEMIC_OFFER_PATH);
  }

  async openRegistrationWindow(): Promise<ReadOnlyNavigationResult> {
    return this.#navigator.open(REGISTRATION_WINDOW_PATH);
  }
}
