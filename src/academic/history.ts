import type {
  AcademicHistoryCourse,
  AcademicHistoryModel,
} from "../core/types";
import { documentText, normalizedText } from "../detection/text";

type CourseField = keyof AcademicHistoryCourse;

const HEADER_ALIASES: Readonly<Record<CourseField, readonly string[]>> = {
  code: ["codigo", "codigo asignatura", "codigo materia", "cod asignatura", "cod materia"],
  name: [
    "asignatura",
    "materia",
    "nombre asignatura",
    "nombre de asignatura",
    "nom asignatura",
    "nom asignat",
    "nom asignal",
  ],
  period: ["periodo", "periodo academico"],
  grade: [
    "calificacion",
    "nota",
    "simbolo",
    "simbolo de calificacion",
    "simbolo nota",
    "simbolo notas",
  ],
  approvedCredits: ["creditos aprobados", "cr aprob", "cr aprobados", "gr aprob"],
  attemptedCredits: ["creditos cursados", "creditos intentados", "cr cursa", "cr cursados"],
  points: ["puntos"],
  comments: ["comentario", "comentarios", "observaciones"],
};

export function readAcademicHistory(document: Document): AcademicHistoryModel {
  const documents = reachableDocuments(document);
  const tableReads = documents.flatMap((currentDocument) =>
    Array.from(currentDocument.querySelectorAll("table")).map(readCourseTable),
  );
  const courses = deduplicateCourses(tableReads.flatMap((read) => read.courses));
  if (courses.length > 0) return { state: "results", courses };
  if (tableReads.some((read) => read.compatible)) return { state: "empty", courses: [] };

  const text = documents
    .map((currentDocument) => `${normalizedText(currentDocument.title)} ${documentText(currentDocument)}`)
    .join(" ");
  if (text.includes("sin resultados") || text.includes("no se encontraron")) {
    return { state: "empty", courses: [] };
  }
  if (text.includes("seleccione") && text.includes("programa")) {
    return { state: "initial", courses: [] };
  }
  if (text.includes("calificaciones historicas") || text.includes("historial academico")) {
    return { state: "unknown", courses: [] };
  }
  return { state: "unavailable", courses: [] };
}

export type ProgramSelectionResult = "activated" | "not-found" | "stale";

export interface ProgramSelection {
  readonly index: number;
  readonly label: string;
}

function reachableDocuments(root: Document): Document[] {
  const documents: Document[] = [];
  const visited = new Set<Document>();

  const visit = (document: Document): void => {
    if (visited.has(document)) return;
    visited.add(document);
    documents.push(document);

    for (const frame of document.querySelectorAll("iframe")) {
      try {
        if (frame.contentDocument) visit(frame.contentDocument);
      } catch {
        // Cross-origin frames are intentionally opaque.
      }
    }
  };

  visit(root);
  return documents;
}

interface CourseTableRead {
  readonly compatible: boolean;
  readonly courses: readonly AcademicHistoryCourse[];
}

function readCourseTable(table: HTMLTableElement): CourseTableRead {
  const rows = Array.from(table.rows).filter((row) => row.closest("table") === table);
  const headerIndex = rows.findIndex((row) => {
    const values = cells(row).map((cell) => normalizedText(cell.textContent));
    return findFieldIndex(values, "code") >= 0 && findFieldIndex(values, "name") >= 0;
  });
  if (headerIndex < 0) return { compatible: false, courses: [] };

  const headers = cells(rows[headerIndex]!).map((cell) => normalizedText(cell.textContent));
  const indexes = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as CourseField[]).map((field) => [field, findFieldIndex(headers, field)]),
  ) as Record<CourseField, number>;
  const hasAcademicResult = [indexes.grade, indexes.approvedCredits, indexes.attemptedCredits, indexes.points]
    .some((index) => index >= 0);
  if (!hasAcademicResult) return { compatible: false, courses: [] };

  const courses = rows.slice(headerIndex + 1).flatMap((row) => {
    const values = cells(row).map((cell) => cleanText(cell.textContent));
    const code = valueAt(values, indexes.code);
    const name = valueAt(values, indexes.name);
    if (!code || !name || isConventionDefinition(code, name)) return [];

    const course: { -readonly [Key in keyof AcademicHistoryCourse]: AcademicHistoryCourse[Key] } = { code, name };
    assignIfPresent(course, "period", valueAt(values, indexes.period));
    assignIfPresent(course, "grade", valueAt(values, indexes.grade));
    assignIfPresent(course, "approvedCredits", valueAt(values, indexes.approvedCredits));
    assignIfPresent(course, "attemptedCredits", valueAt(values, indexes.attemptedCredits));
    assignIfPresent(course, "points", valueAt(values, indexes.points));
    assignIfPresent(course, "comments", valueAt(values, indexes.comments));
    return [course];
  });
  return { compatible: true, courses };
}

function deduplicateCourses(courses: readonly AcademicHistoryCourse[]): AcademicHistoryCourse[] {
  const unique = new Map<string, AcademicHistoryCourse>();
  for (const course of courses) {
    const key = [
      course.code,
      course.name,
      course.period,
      course.grade,
      course.approvedCredits,
      course.attemptedCredits,
      course.points,
      course.comments,
    ].join("\u0000");
    if (!unique.has(key)) unique.set(key, course);
  }
  return Array.from(unique.values());
}

function isConventionDefinition(code: string, name: string): boolean {
  const normalizedCode = normalizedText(code);
  if (!["re", "n-1", "map", "nop"].includes(normalizedCode)) return false;
  const normalizedName = normalizedText(name);
  return normalizedName.includes("asignatura retirada") ||
    normalizedName.includes("calificacion no computada") ||
    normalizedName.includes("mayor calificacion aprobada") ||
    normalizedName.includes("no pensum");
}

function cells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.querySelectorAll(":scope > th, :scope > td"));
}

function findFieldIndex(headers: readonly string[], field: CourseField): number {
  return headers.findIndex((header) => {
    const canonical = canonicalHeader(header);
    return HEADER_ALIASES[field].some((alias) => {
      const canonicalAlias = canonicalHeader(alias);
      return canonical === canonicalAlias || canonical.startsWith(`${canonicalAlias} `);
    });
  });
}

function canonicalHeader(value: string): string {
  return normalizedText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function valueAt(values: readonly string[], index: number): string {
  return index >= 0 ? values[index] ?? "" : "";
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function assignIfPresent(
  course: { -readonly [Key in keyof AcademicHistoryCourse]: AcademicHistoryCourse[Key] },
  field: Exclude<CourseField, "code" | "name">,
  value: string,
): void {
  if (value) course[field] = value;
}
