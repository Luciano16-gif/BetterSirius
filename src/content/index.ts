import type {
  AcademicHistoryPending,
  AcademicOfferLookupPending,
  AcademicOfferPending,
  ShellModel,
} from "../core/types";
import { readAcademicProcesses } from "../academic/processes";
import { AcademicHistoryFlow } from "../academic/history-flow";
import { AcademicOfferController } from "../academic/offer";
import { reconcileAcademicOffer } from "../academic/offer-flow";
import { detectPortalSurface } from "../detection/portal-detector";
import { FrameRegistry } from "../registry/frame-registry";
import { AcademicNavigator } from "../navigation/academic-navigator";
import { HistoryProgramController } from "../navigation/history-program-controller";
import { HistoryPeriodController } from "../navigation/history-period-controller";
import { assertAllowedRuntimeLocation } from "../safety/runtime-policy";
import { mountBetterSiriusShell } from "../ui/shell";
import { mountBetterSiriusLogin } from "../login/login-shell";

function start(): void {
  assertAllowedRuntimeLocation(window.location);
  const detection = detectPortalSurface(document);

  if (detection.kind === "unsupported") return;
  if (detection.kind === "login") {
    const login = mountBetterSiriusLogin(document);
    if (!login) return;
    window.addEventListener("pagehide", () => login.dispose(), { once: true });
    return;
  }

  let model: ShellModel = {
    portalState: detection.kind,
    applications: [],
    academicProcesses: readAcademicProcesses(document),
    academicHistory: { state: "unavailable", courses: [] },
    academicOffer: { state: "unavailable", offerings: [] },
  };
  const navigator = new AcademicNavigator(document);
  const programController = new HistoryProgramController(document);
  const periodController = new HistoryPeriodController(document);
  const historyFlow = new AcademicHistoryFlow(model.academicHistory);
  const offerController = new AcademicOfferController(document);
  let historyTimeout: number | undefined;
  let offerTimeout: number | undefined;
  let offerLookupTimeout: number | undefined;
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

  const beginOfferOperation = (kind: AcademicOfferPending, query?: string): void => {
    model = {
      ...model,
      academicOffer: {
        ...model.academicOffer,
        pending: kind,
        ...(query ?? model.academicOffer.query
          ? { query: query ?? model.academicOffer.query! }
          : {}),
      },
    };
    if (offerTimeout !== undefined) window.clearTimeout(offerTimeout);
    offerTimeout = window.setTimeout(() => {
      offerTimeout = undefined;
      model = {
        ...model,
        academicOffer: {
          state: "unknown",
          offerings: [],
          ...(model.academicOffer.query ? { query: model.academicOffer.query } : {}),
          ...(model.academicOffer.lookup ? { lookup: model.academicOffer.lookup } : {}),
        },
      };
      shell.update(model);
    }, 45_000);
    shell?.update(model);
  };

  const cancelOfferOperation = (previous: ShellModel["academicOffer"]): void => {
    if (offerTimeout !== undefined) window.clearTimeout(offerTimeout);
    offerTimeout = undefined;
    model = { ...model, academicOffer: previous };
    shell.update(model);
  };

  const beginOfferLookupOperation = (kind: AcademicOfferLookupPending, query?: string): void => {
    const previousLookup = model.academicOffer.lookup ?? { state: "initial" as const, options: [] };
    model = {
      ...model,
      academicOffer: {
        ...model.academicOffer,
        lookup: {
          ...previousLookup,
          pending: kind,
          ...(query ?? previousLookup.query ? { query: query ?? previousLookup.query! } : {}),
        },
      },
    };
    if (offerLookupTimeout !== undefined) window.clearTimeout(offerLookupTimeout);
    offerLookupTimeout = window.setTimeout(() => {
      offerLookupTimeout = undefined;
      const currentLookup = model.academicOffer.lookup;
      model = {
        ...model,
        academicOffer: {
          ...model.academicOffer,
          lookup: {
            state: "unknown",
            options: [],
            ...(currentLookup?.query ? { query: currentLookup.query } : {}),
          },
        },
      };
      shell.update(model);
    }, 20_000);
    shell?.update(model);
  };

  const cancelOfferLookupOperation = (previous: ShellModel["academicOffer"]): void => {
    if (offerLookupTimeout !== undefined) window.clearTimeout(offerLookupTimeout);
    offerLookupTimeout = undefined;
    model = { ...model, academicOffer: previous };
    shell.update(model);
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
    onOpenAcademicOffer: async () => {
      const previous = model.academicOffer;
      beginOfferOperation("opening");
      const result = await navigator.openAcademicOffer();
      if (result !== "activated") cancelOfferOperation(previous);
      return result;
    },
    onSearchAcademicOffer: async (code) => {
      const previous = model.academicOffer;
      beginOfferOperation("searching", code);
      const result = await offerController.search(code);
      if (result !== "activated") cancelOfferOperation(previous);
      return result;
    },
    onOpenAcademicOfferLookup: async () => {
      const previous = model.academicOffer;
      beginOfferLookupOperation("opening");
      const result = await offerController.openLookup();
      if (result !== "activated") cancelOfferLookupOperation(previous);
      return result;
    },
    onSearchAcademicOfferLookup: async (query) => {
      const previous = model.academicOffer;
      beginOfferLookupOperation("searching", query);
      const result = await offerController.searchLookup(query);
      if (result !== "activated") cancelOfferLookupOperation(previous);
      return result;
    },
    onSelectAcademicOfferLookup: async (selection) => {
      const result = await offerController.selectLookup(selection);
      if (result === "activated") beginOfferOperation("searching", selection.code);
      return result;
    },
    onCloseAcademicOfferLookup: async () => {
      const result = offerController.closeLookup();
      if (result === "activated") {
        const { lookup: _discardedLookup, ...academicOffer } = model.academicOffer;
        model = { ...model, academicOffer };
        shell.update(model);
      }
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
  const registry = new FrameRegistry(document, ({ applications, academicHistory, academicOffer }) => {
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
    const currentOffer = model.academicOffer;
    const coordinatedOffer = reconcileAcademicOffer(currentOffer, academicOffer);
    if (!coordinatedOffer.pending && offerTimeout !== undefined) {
      window.clearTimeout(offerTimeout);
      offerTimeout = undefined;
    }
    if (!coordinatedOffer.lookup?.pending && offerLookupTimeout !== undefined) {
      window.clearTimeout(offerLookupTimeout);
      offerLookupTimeout = undefined;
    }
    model = {
      ...model,
      applications,
      academicHistory: coordinatedHistory,
      academicOffer: coordinatedOffer,
    };
    shell.update(model);
  });

  if (detection.kind === "portal-shell") registry.start();

  window.addEventListener(
    "pagehide",
    () => {
      registry.stop();
      if (historyTimeout !== undefined) window.clearTimeout(historyTimeout);
      if (offerTimeout !== undefined) window.clearTimeout(offerTimeout);
      if (offerLookupTimeout !== undefined) window.clearTimeout(offerLookupTimeout);
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
