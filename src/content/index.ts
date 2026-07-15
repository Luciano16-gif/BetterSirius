import type { AcademicHistoryPending, ShellModel } from "../core/types";
import { readAcademicProcesses } from "../academic/processes";
import { AcademicHistoryFlow } from "../academic/history-flow";
import { detectPortalSurface } from "../detection/portal-detector";
import { FrameRegistry } from "../registry/frame-registry";
import { AcademicNavigator } from "../navigation/academic-navigator";
import { HistoryProgramController } from "../navigation/history-program-controller";
import { HistoryPeriodController } from "../navigation/history-period-controller";
import { assertAllowedRuntimeLocation } from "../safety/runtime-policy";
import { mountBetterSiriusShell } from "../ui/shell";

function start(): void {
  assertAllowedRuntimeLocation(window.location);
  const detection = detectPortalSurface(document);

  if (detection.kind === "unsupported" || detection.kind === "login") return;

  let model: ShellModel = {
    portalState: detection.kind,
    applications: [],
    academicProcesses: readAcademicProcesses(document),
    academicHistory: { state: "unavailable", courses: [] },
  };
  const navigator = new AcademicNavigator(document);
  const programController = new HistoryProgramController(document);
  const periodController = new HistoryPeriodController(document);
  const historyFlow = new AcademicHistoryFlow(model.academicHistory);
  let historyTimeout: number | undefined;
  let shell: ReturnType<typeof mountBetterSiriusShell>;

  const beginHistoryOperation = (
    kind: AcademicHistoryPending,
    targetPeriodCode?: string,
  ): void => {
    model = {
      ...model,
      academicHistory: historyFlow.begin(kind, model.academicHistory, targetPeriodCode),
    };
    if (historyTimeout !== undefined) window.clearTimeout(historyTimeout);
    historyTimeout = window.setTimeout(() => {
      historyTimeout = undefined;
      model = { ...model, academicHistory: historyFlow.expire() };
      shell.update(model);
    }, 45_000);
  };

  shell = mountBetterSiriusShell(document, model, {
    onOpenHistoricalGrades: async () => {
      const result = await navigator.openHistoricalGrades();
      if (result === "activated") beginHistoryOperation("opening");
      return result;
    },
    onOpenPeriodGrades: async () => {
      const result = await navigator.openPeriodGrades();
      if (result === "activated") beginHistoryOperation("opening");
      return result;
    },
    onDiscoverHistoricalPrograms: () => programController.discover(),
    onSelectHistoricalProgram: (selection) => {
      const result = programController.activate(selection);
      if (result === "activated") beginHistoryOperation("program");
      return Promise.resolve(result);
    },
    onSetHistoricalWithdrawn: (enabled) => Promise.resolve(programController.setWithdrawnCourses(enabled)),
    onSelectHistoricalPeriod: (selection) => {
      const result = periodController.activate(selection);
      if (result === "activated") beginHistoryOperation("period", selection.code);
      return Promise.resolve(result);
    },
  });
  const registry = new FrameRegistry(document, ({ applications, academicHistory }) => {
    const hasPeriodSurface = academicHistory.state === "results" || academicHistory.state === "empty";
    const periods = hasPeriodSurface ? periodController.discover() : [];
    const activePeriod = periods.find((period) => period.active);
    const enrichedHistory = hasPeriodSurface
      ? {
          ...academicHistory,
          periods,
          courses: academicHistory.courses.map((course) =>
            course.period || !activePeriod ? course : { ...course, period: activePeriod.label },
          ),
        }
      : academicHistory;
    const coordinatedHistory = historyFlow.reconcile(enrichedHistory);
    if (!coordinatedHistory.pending && historyTimeout !== undefined) {
      window.clearTimeout(historyTimeout);
      historyTimeout = undefined;
    }
    model = { ...model, applications, academicHistory: coordinatedHistory };
    shell.update(model);
  });

  if (detection.kind === "portal-shell") registry.start();

  window.addEventListener(
    "pagehide",
    () => {
      registry.stop();
      if (historyTimeout !== undefined) window.clearTimeout(historyTimeout);
      shell.dispose();
    },
    { once: true },
  );
}

try {
  start();
} catch {
  // Fail open: leave the original SAP interface untouched and do not log session context.
}
