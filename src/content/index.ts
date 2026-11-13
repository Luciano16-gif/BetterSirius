import type {
  AcademicHistoryPending,
  AcademicOfferLookupPending,
  AcademicOfferPending,
  ShellModel,
  WebPaymentsModel,
} from "../core/types";
import { readAcademicProcesses } from "../academic/processes";
import { AcademicHistoryFlow } from "../academic/history-flow";
import { AcademicOfferController } from "../academic/offer";
import { reconcileAcademicOffer } from "../academic/offer-flow";
import { detectPortalSurface } from "../detection/portal-detector";
import { FrameRegistry } from "../registry/frame-registry";
import { AcademicNavigator } from "../navigation/academic-navigator";
import { FinancialNavigator } from "../navigation/financial-navigator";
import { HistoryProgramController } from "../navigation/history-program-controller";
import { HistoryPeriodController } from "../navigation/history-period-controller";
import { assertAllowedRuntimeLocation } from "../safety/runtime-policy";
import { mountBetterSiriusShell } from "../ui/shell";
import { mountBetterSiriusLogin } from "../login/login-shell";
import {
  startWebPaymentsFramePublisher,
  webPaymentsFromBridgeEvent,
} from "../finance/web-payments-bridge";
import {
  listenForWebPaymentsRuntime,
  listenForWebPaymentsRuntimeProbe,
  publishWebPaymentsRuntime,
  validateWebPaymentsRuntimeSources,
} from "../finance/web-payments-runtime";
import { listenForProntoPago } from "../finance/pronto-pago-runtime";

function start(): void {
  assertAllowedRuntimeLocation(window.location);
  const detection = detectPortalSurface(document);

  if (detection.kind === "unsupported") return;
  if (detection.kind === "login") {
    const login = mountBetterSiriusLogin(document);
    if (!login) return;
    disposeOnPageHide(() => login.dispose());
    return;
  }

  let model: ShellModel = {
    portalState: detection.kind,
    applications: [],
    academicProcesses: readAcademicProcesses(document),
    academicHistory: { state: "unavailable", courses: [] },
    academicOffer: { state: "unavailable", offerings: [] },
    registrationWindow: { state: "unavailable" },
    prontoPago: { state: "unavailable" },
    webPayments: { state: "unavailable" },
  };
  const navigator = new AcademicNavigator(document);
  const financialNavigator = new FinancialNavigator(document);
  const programController = new HistoryProgramController(document);
  const periodController = new HistoryPeriodController(document);
  const historyFlow = new AcademicHistoryFlow(model.academicHistory);
  const offerController = new AcademicOfferController(
    document,
    () => navigator.openAcademicOffer(),
  );
  let historyTimeout: number | undefined;
  let offerTimeout: number | undefined;
  let offerRequestId = 0;
  let offerLookupTimeout: number | undefined;
  let offerLookupRequestId = 0;
  let registrationWindowTimeout: number | undefined;
  let webPaymentsTimeout: number | undefined;
  let prontoPagoTimeout: number | undefined;
  let prontoPagoSource: string | undefined;
  let shell: ReturnType<typeof mountBetterSiriusShell>;
  const bridgedWebPayments = new Map<string | Window, WebPaymentsModel>();
  let paymentFrames: ReadonlySet<HTMLIFrameElement> = new Set();
  let localWebPayments: WebPaymentsModel = { state: "unavailable" };

  const readBridgedWebPayments = (): WebPaymentsModel => {
    if (localWebPayments.state !== "unavailable") return localWebPayments;
    let selected: WebPaymentsModel = { state: "unavailable" };
    for (const candidate of bridgedWebPayments.values()) {
      if (webPaymentsPriority(candidate) > webPaymentsPriority(selected)) selected = candidate;
    }
    return selected;
  };
  const acceptBridgedPayment = (
    source: string | Window,
    paymentModel: WebPaymentsModel,
  ): void => {
    if (paymentModel.state === "unavailable") bridgedWebPayments.delete(source);
    else bridgedWebPayments.set(source, paymentModel);
    const observed = readBridgedWebPayments();
    if (model.webPayments.pending && observed.state !== "results") return;
    model = { ...model, webPayments: observed };
    if (observed.state === "results" && webPaymentsTimeout !== undefined) {
      window.clearTimeout(webPaymentsTimeout);
      webPaymentsTimeout = undefined;
    }
    shell?.update(model);
  };
  const onFrameMessage = (event: MessageEvent): void => {
    if (stopRuntimePayments || !event.source) return;
    const source = Array.from(paymentFrames).find((frame) => frame.contentWindow === event.source)?.contentWindow;
    if (!source) return;
    const paymentModel = webPaymentsFromBridgeEvent(event);
    if (!paymentModel) return;
    acceptBridgedPayment(source, paymentModel);
  };
  window.addEventListener("message", onFrameMessage);
  const stopRuntimePayments = listenForWebPaymentsRuntime((source, paymentModel) => {
    acceptBridgedPayment(source, paymentModel);
  });
  const clearProntoPagoTimeout = (): void => {
    if (prontoPagoTimeout !== undefined) window.clearTimeout(prontoPagoTimeout);
    prontoPagoTimeout = undefined;
  };
  const stopProntoPago = listenForProntoPago((source, prontoPago) => {
    if (prontoPago.state === "unavailable") {
      if (source !== prontoPagoSource || model.prontoPago.state === "opening") return;
      prontoPagoSource = undefined;
    } else {
      prontoPagoSource = source;
    }
    clearProntoPagoTimeout();
    model = { ...model, prontoPago };
    shell?.update(model);
  });

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
    const academicOffer = kind === "searching"
      ? {
          state: "initial" as const,
          offerings: [],
          pending: kind,
          ...(query ? { query } : {}),
          ...(model.academicOffer.lookup ? { lookup: model.academicOffer.lookup } : {}),
        }
      : {
          ...model.academicOffer,
          pending: kind,
          ...(query ?? model.academicOffer.query
            ? { query: query ?? model.academicOffer.query! }
            : {}),
        };
    model = {
      ...model,
      academicOffer,
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
    const lookup = kind === "searching"
      ? {
          state: "initial" as const,
          options: [],
          pending: kind,
          ...(query ? { query } : {}),
        }
      : {
          ...previousLookup,
          pending: kind,
          ...(query ?? previousLookup.query ? { query: query ?? previousLookup.query! } : {}),
        };
    model = {
      ...model,
      academicOffer: {
        ...model.academicOffer,
        lookup,
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
    onOpenRegistrationWindow: async () => {
      const previous = model.registrationWindow;
      model = {
        ...model,
        registrationWindow: { ...previous, pending: "opening" },
      };
      shell.update(model);
      const result = await navigator.openRegistrationWindow();
      if (result !== "activated") {
        model = { ...model, registrationWindow: previous };
        shell.update(model);
        return result;
      }
      if (registrationWindowTimeout !== undefined) {
        window.clearTimeout(registrationWindowTimeout);
      }
      registrationWindowTimeout = window.setTimeout(() => {
        registrationWindowTimeout = undefined;
        model = { ...model, registrationWindow: { state: "unknown" } };
        shell.update(model);
      }, 45_000);
      return result;
    },
    onOpenProntoPago: async () => {
      clearProntoPagoTimeout();
      prontoPagoSource = undefined;
      model = { ...model, prontoPago: { state: "opening" } };
      shell.update(model);
      const result = await financialNavigator.openProntoPago();
      if (result !== "activated") {
        model = { ...model, prontoPago: { state: "unavailable" } };
        shell.update(model);
        return result;
      }
      if (webPaymentsTimeout !== undefined) window.clearTimeout(webPaymentsTimeout);
      webPaymentsTimeout = undefined;
      bridgedWebPayments.clear();
      model = { ...model, webPayments: { state: "unavailable" } };
      shell.update(model);
      if (model.prontoPago.state !== "opening") return result;
      prontoPagoTimeout = window.setTimeout(() => {
        prontoPagoTimeout = undefined;
        model = { ...model, prontoPago: { state: "unknown" } };
        shell.update(model);
      }, 45_000);
      return result;
    },
    onOpenWebPayments: async () => {
      model = { ...model, webPayments: { state: "unavailable", pending: "opening" } };
      shell.update(model);
      const result = await financialNavigator.openWebPayments();
      if (result !== "activated") {
        model = { ...model, webPayments: { state: "unavailable" } };
        shell.update(model);
        return result;
      }
      clearProntoPagoTimeout();
      prontoPagoSource = undefined;
      model = { ...model, prontoPago: { state: "unavailable" } };
      shell.update(model);
      if (!model.webPayments.pending) return result;
      if (webPaymentsTimeout !== undefined) window.clearTimeout(webPaymentsTimeout);
      webPaymentsTimeout = window.setTimeout(() => {
        webPaymentsTimeout = undefined;
        model = { ...model, webPayments: { state: "unknown" } };
        shell.update(model);
      }, 45_000);
      return result;
    },
    onOpenWebPaymentMessages: () => financialNavigator.openMessages(),
    onSearchAcademicOffer: async (code) => {
      const requestId = ++offerRequestId;
      const previous = model.academicOffer;
      beginOfferOperation("searching", code);
      const result = await offerController.search(code);
      if (requestId !== offerRequestId) return result;
      if (result !== "activated") {
        cancelOfferOperation(previous);
      } else {
        const hydration = await offerController.hydrateSearchResults();
        if (requestId !== offerRequestId || hydration.status === "stale") return result;
        if (offerTimeout !== undefined) window.clearTimeout(offerTimeout);
        offerTimeout = undefined;
        model = {
          ...model,
          academicOffer: {
            ...hydration.offer,
            ...(hydration.offer.state === "results" || hydration.offer.state === "empty"
              ? { query: code }
              : {}),
            ...(model.academicOffer.lookup ? { lookup: model.academicOffer.lookup } : {}),
          },
        };
        shell.update(model);
      }
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
      const requestId = ++offerLookupRequestId;
      const previous = model.academicOffer;
      beginOfferLookupOperation("searching", query);
      const result = await offerController.searchLookup(query);
      if (requestId !== offerLookupRequestId) return result;
      if (result !== "activated") {
        cancelOfferLookupOperation(previous);
      } else {
        const hydration = await offerController.hydrateLookupResults();
        if (requestId !== offerLookupRequestId || hydration.status === "stale") return result;
        if (offerLookupTimeout !== undefined) window.clearTimeout(offerLookupTimeout);
        offerLookupTimeout = undefined;
        const state = hydration.options.length > 0
          ? "results" as const
          : hydration.status === "empty"
            ? "empty" as const
            : "unknown" as const;
        model = {
          ...model,
          academicOffer: {
            ...(hydration.status === "error"
              ? { state: "error" as const, offerings: [] }
              : model.academicOffer),
            lookup: { state, query, options: hydration.options },
          },
        };
        shell.update(model);
      }
      return result;
    },
    onSelectAcademicOfferLookup: async (selection) => {
      const requestId = ++offerRequestId;
      const previous = model.academicOffer;
      const result = await offerController.selectLookup(selection);
      if (requestId !== offerRequestId) return result;
      if (result !== "activated") return result;
      beginOfferOperation("searching", selection.code);
      const hydration = await offerController.hydrateSearchResults();
      if (requestId !== offerRequestId || hydration.status === "stale") return result;
      if (hydration.status === "not-found" && hydration.offer.state !== "error") {
        cancelOfferOperation(previous);
        return result;
      }
      if (offerTimeout !== undefined) window.clearTimeout(offerTimeout);
      offerTimeout = undefined;
      model = {
        ...model,
        academicOffer: {
          ...hydration.offer,
          query: selection.code,
          ...(previous.lookup ? { lookup: previous.lookup } : {}),
        },
      };
      shell.update(model);
      return result;
    },
    onCloseAcademicOfferLookup: async () => {
      const result = offerController.closeLookup();
      if (result === "activated") {
        offerLookupRequestId += 1;
        if (offerLookupTimeout !== undefined) window.clearTimeout(offerLookupTimeout);
        offerLookupTimeout = undefined;
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
  const registry = new FrameRegistry(
    document,
    ({ portalState, applications, academicHistory, academicOffer, registrationWindow, webPayments }) => {
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
    const coordinatedRegistrationWindow = model.registrationWindow.pending
      && registrationWindow.state !== "results"
      ? model.registrationWindow
      : registrationWindow;
    if (!coordinatedRegistrationWindow.pending && registrationWindowTimeout !== undefined) {
      window.clearTimeout(registrationWindowTimeout);
      registrationWindowTimeout = undefined;
    }
    localWebPayments = webPayments;
    const observedWebPayments = readBridgedWebPayments();
    const coordinatedWebPayments = model.webPayments.pending
      && observedWebPayments.state !== "results"
      ? model.webPayments
      : observedWebPayments;
    if (!coordinatedWebPayments.pending && webPaymentsTimeout !== undefined) {
      window.clearTimeout(webPaymentsTimeout);
      webPaymentsTimeout = undefined;
    }
    model = {
      ...model,
      portalState,
      applications,
      academicHistory: coordinatedHistory,
      academicOffer: coordinatedOffer,
      registrationWindow: coordinatedRegistrationWindow,
      webPayments: coordinatedWebPayments,
    };
    shell.update(model);
    },
    (frames) => {
      paymentFrames = frames;
      const liveWindows = new Set(Array.from(frames, (frame) => frame.contentWindow));
      for (const source of bridgedWebPayments.keys()) {
        if (typeof source !== "string" && !liveWindows.has(source)) {
          acceptBridgedPayment(source, { state: "unavailable" });
        }
      }
      validateWebPaymentsRuntimeSources(
        Array.from(bridgedWebPayments.keys()).filter((source): source is string => typeof source === "string"),
      );
    },
  );

  if (detection.kind === "portal-shell") registry.start();

  disposeOnPageHide(() => {
    registry.stop();
    if (historyTimeout !== undefined) window.clearTimeout(historyTimeout);
    if (offerTimeout !== undefined) window.clearTimeout(offerTimeout);
    if (offerLookupTimeout !== undefined) window.clearTimeout(offerLookupTimeout);
    if (registrationWindowTimeout !== undefined) window.clearTimeout(registrationWindowTimeout);
    if (webPaymentsTimeout !== undefined) window.clearTimeout(webPaymentsTimeout);
    clearProntoPagoTimeout();
    window.removeEventListener("message", onFrameMessage);
    stopRuntimePayments?.();
    stopProntoPago();
    bridgedWebPayments.clear();
    shell.dispose();
  });
}

function disposeOnPageHide(dispose: () => void): void {
  const onPageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) return;
    window.removeEventListener("pagehide", onPageHide);
    dispose();
  };
  window.addEventListener("pagehide", onPageHide);
}

function webPaymentsPriority(model: WebPaymentsModel): number {
  return model.state === "results" ? 3 : model.state === "unknown" ? 2 : 1;
}

if (window.top !== window) {
  listenForWebPaymentsRuntimeProbe();
  startWebPaymentsFramePublisher(window, document, publishWebPaymentsRuntime);
} else {
  try {
    start();
  } catch {
    // Fail open: leave the original SAP interface untouched and do not log session context.
  }
}
