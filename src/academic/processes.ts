import type {
  AcademicProcessGroup,
  AcademicProcessGroupId,
  AcademicProcessMode,
  AcademicProcessesModel,
} from "../core/types";
import { normalizedText } from "../detection/text";

interface ProcessDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly mode: AcademicProcessMode;
}

interface GroupDefinition {
  readonly id: AcademicProcessGroupId;
  readonly label: string;
  readonly description: string;
  readonly processes: readonly ProcessDefinition[];
}

const GROUP_DEFINITIONS: readonly GroupDefinition[] = [
  {
    id: "enrollment",
    label: "Matrícula Pregrado",
    description: "Planificación, oferta e información del proceso de inscripción.",
    processes: [
      {
        id: "registration-window",
        label: "Turno de Inscripción",
        description: "Consulta las fechas y horas asignadas por Sirius.",
        mode: "read-only",
      },
      {
        id: "academic-offer",
        label: "Oferta Académica",
        description: "Revisa las materias ofrecidas sin búsquedas automáticas.",
        mode: "read-only",
      },
      {
        id: "registration",
        label: "Inscripción 2.0",
        description: "Flujo transaccional; permanece bloqueado en BetterSirius.",
        mode: "blocked",
      },
      {
        id: "registration-guide",
        label: "Instructivo",
        description: "Referencia oficial para preparar el proceso de inscripción.",
        mode: "reference",
      },
    ],
  },
  {
    id: "term",
    label: "Trimestre Pregrado",
    description: "Información de matrícula y organización del trimestre actual.",
    processes: [
      {
        id: "enrollment-certificate",
        label: "Certificado Inscripción",
        description: "La generación de documentos permanece bloqueada.",
        mode: "blocked",
      },
      {
        id: "course-withdrawal",
        label: "Retiro Asignaturas",
        description: "Acción académica sensible; no disponible en BetterSirius.",
        mode: "blocked",
      },
      {
        id: "student-schedule",
        label: "Horario del Estudiante Completo",
        description: "Vista de solo lectura prevista para el próximo parser.",
        mode: "read-only",
      },
    ],
  },
  {
    id: "requests",
    label: "Consultas y Solicitudes",
    description: "Consultas académicas y trámites que requieren límites distintos.",
    processes: [
      {
        id: "historical-grades",
        label: "Consulta Calificaciones Históricas",
        description: "Historial académico de solo lectura.",
        mode: "read-only",
      },
      {
        id: "personal-data",
        label: "Actualización Datos Personales",
        description: "Modifica identidad o perfil; permanece bloqueado.",
        mode: "blocked",
      },
      {
        id: "period-grades",
        label: "Consulta de Calificaciones Período",
        description: "Calificaciones del período en modo de solo lectura.",
        mode: "read-only",
      },
      {
        id: "unimet-email",
        label: "Solicitud de Correo UNIMET",
        description: "Solicitud externa; permanece bloqueada en esta fase.",
        mode: "blocked",
      },
    ],
  },
  {
    id: "online-courses",
    label: "Cursos en Línea",
    description: "Acceso académico a las plataformas de cursos.",
    processes: [],
  },
  {
    id: "audit-graduation",
    label: "Auditoría y Titulación",
    description: "Procesos de avance académico, auditoría y titulación.",
    processes: [],
  },
  {
    id: "student-voice",
    label: "La Voz del Estudiante",
    description: "Canal institucional para la participación estudiantil.",
    processes: [],
  },
  {
    id: "teaching-assistants",
    label: "Evaluación de preparadores",
    description: "Evaluación académica de preparadores.",
    processes: [],
  },
] as const;

const ALLOWED_LABELS = new Set(
  GROUP_DEFINITIONS.flatMap((group) => group.processes.map((process) => normalizedText(process.label))),
);

export function readAcademicProcesses(document: Document): AcademicProcessesModel {
  const detectedLabels = new Set<string>();
  const candidates = document.querySelectorAll("a, button, [role='menuitem']");

  for (const candidate of candidates) {
    const label = normalizedText(candidate.textContent);
    if (ALLOWED_LABELS.has(label)) detectedLabels.add(label);
  }

  return buildModel(detectedLabels);
}

export function academicProcessCatalog(allDetected = false): AcademicProcessesModel {
  return buildModel(
    allDetected
      ? new Set(ALLOWED_LABELS)
      : new Set<string>(),
  );
}

function buildModel(detectedLabels: ReadonlySet<string>): AcademicProcessesModel {
  let detectedCount = 0;
  const groups: AcademicProcessGroup[] = GROUP_DEFINITIONS.map((group) => ({
    ...group,
    processes: group.processes.map((process) => {
      const detected = detectedLabels.has(normalizedText(process.label));
      if (detected) detectedCount += 1;
      return { ...process, detected };
    }),
  }));

  return {
    groups,
    detectedCount,
    totalCount: GROUP_DEFINITIONS.reduce((total, group) => total + group.processes.length, 0),
  };
}
