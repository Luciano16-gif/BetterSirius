import { readAcademicHistory } from "../academic/history";
import { readAcademicOffer } from "../academic/offer";
import { readRegistrationWindow } from "../academic/registration-window";
import { readWebPayments } from "../finance/web-payments";
import type {
  AcademicHistoryModel,
  AcademicOfferLookupModel,
  AcademicOfferModel,
  DetectedApplication,
  PortalSurface,
  RegistrationWindowModel,
  WebPaymentsModel,
} from "../core/types";
import { applicationFromUrl, detectApplication } from "../detection/application-detector";
import { detectPortalSurface } from "../detection/portal-detector";

export interface RegistrySnapshot {
  readonly portalState: Exclude<PortalSurface, "unsupported" | "login">;
  readonly applications: readonly DetectedApplication[];
  readonly academicHistory: AcademicHistoryModel;
  readonly academicOffer: AcademicOfferModel;
  readonly registrationWindow: RegistrationWindowModel;
  readonly webPayments: WebPaymentsModel;
}

interface FrameState {
  readonly application: DetectedApplication;
  readonly academicHistory: AcademicHistoryModel;
  readonly academicOffer: AcademicOfferModel;
  readonly registrationWindow: RegistrationWindowModel;
  readonly webPayments: WebPaymentsModel;
}

export type RegistryListener = (snapshot: RegistrySnapshot) => void;

export class FrameRegistry {
  readonly #rootDocument: Document;
  readonly #listener: RegistryListener;
  readonly #observer: MutationObserver;
  readonly #frameStates = new Map<HTMLIFrameElement, FrameState>();
  readonly #loadHandlers = new Map<HTMLIFrameElement, EventListener>();
  readonly #documentObservers = new Map<Document, MutationObserver>();
  #scanScheduled = false;
  #healthTimer: number | undefined;
  #lastSnapshotSignature = "";

  constructor(rootDocument: Document, listener: RegistryListener) {
    this.#rootDocument = rootDocument;
    this.#listener = listener;
    this.#observer = new MutationObserver(() => this.#scheduleScan());
  }

  start(): void {
    this.scan();
    this.#observer.observe(this.#rootDocument.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    const view = this.#rootDocument.defaultView;
    if (view) this.#healthTimer = view.setInterval(() => this.scan(), 2_000);
  }

  stop(): void {
    this.#observer.disconnect();
    for (const [frame, handler] of this.#loadHandlers) frame.removeEventListener("load", handler);
    this.#loadHandlers.clear();
    for (const observer of this.#documentObservers.values()) observer.disconnect();
    this.#documentObservers.clear();
    this.#frameStates.clear();
    if (this.#healthTimer !== undefined) {
      this.#rootDocument.defaultView?.clearInterval(this.#healthTimer);
      this.#healthTimer = undefined;
    }
    this.#lastSnapshotSignature = "";
  }

  scan(): void {
    this.#scanScheduled = false;
    const currentFrames = new Set<HTMLIFrameElement>();
    const currentDocuments = new Set<Document>();
    this.#collectFrames(this.#rootDocument, currentFrames, currentDocuments, new Set());

    for (const frame of this.#loadHandlers.keys()) {
      if (!currentFrames.has(frame)) this.#forget(frame);
    }

    for (const frame of currentFrames) {
      if (!this.#loadHandlers.has(frame)) {
        const handler: EventListener = () => this.scan();
        frame.addEventListener("load", handler);
        this.#loadHandlers.set(frame, handler);
      }
      this.#inspect(frame);
    }

    this.#syncDocumentObservers(currentDocuments);
    this.#emit();
  }

  #scheduleScan(): void {
    if (this.#scanScheduled) return;
    this.#scanScheduled = true;
    queueMicrotask(() => {
      if (this.#scanScheduled) this.scan();
    });
  }

  #collectFrames(
    document: Document,
    frames: Set<HTMLIFrameElement>,
    documents: Set<Document>,
    visited: Set<Document>,
  ): void {
    if (visited.has(document)) return;
    visited.add(document);

    for (const frame of document.querySelectorAll("iframe")) {
      frames.add(frame);
      try {
        const childDocument = frame.contentDocument;
        if (!childDocument) continue;
        documents.add(childDocument);
        this.#collectFrames(childDocument, frames, documents, visited);
      } catch {
        // Cross-origin frames remain opaque and are represented only by a safe path fingerprint.
      }
    }
  }

  #syncDocumentObservers(documents: ReadonlySet<Document>): void {
    for (const [document, observer] of this.#documentObservers) {
      if (!documents.has(document)) {
        observer.disconnect();
        this.#documentObservers.delete(document);
      }
    }
    for (const document of documents) {
      if (this.#documentObservers.has(document) || !document.documentElement) continue;
      const observer = new MutationObserver(() => this.#scheduleScan());
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      this.#documentObservers.set(document, observer);
    }
  }

  #inspect(frame: HTMLIFrameElement): void {
    const source = frame.getAttribute("src") ?? "";
    const pathFingerprint = applicationFromUrl(source, this.#rootDocument.location.href);

    try {
      const frameDocument = frame.contentDocument;
      const detection = frameDocument ? detectApplication(frameDocument, pathFingerprint) : null;
      if (detection) {
        this.#frameStates.set(frame, {
          application: detection,
          academicHistory: detection.application === "historical-grades" && frameDocument
            ? readAcademicHistory(frameDocument)
            : { state: "unavailable", courses: [] },
          academicOffer: detection.application === "academic-offer" && frameDocument
            ? readAcademicOffer(frameDocument)
            : { state: "unavailable", offerings: [] },
          registrationWindow: detection.application === "registration-window" && frameDocument
            ? readRegistrationWindow(frameDocument)
            : { state: "unavailable" },
          webPayments: detection.application === "web-payments" && frameDocument
            ? readWebPayments(frameDocument)
            : { state: "unavailable" },
        });
      }
      else this.#frameStates.delete(frame);
    } catch {
      if (pathFingerprint) {
        this.#frameStates.set(frame, {
          application: {
            application: pathFingerprint,
            state: "unknown",
            confidence: 0.8,
          },
          academicHistory: { state: "unavailable", courses: [] },
          academicOffer: { state: "unavailable", offerings: [] },
          registrationWindow: { state: "unavailable" },
          webPayments: { state: "unavailable" },
        });
      } else {
        this.#frameStates.delete(frame);
      }
    }
  }

  #forget(frame: HTMLIFrameElement): void {
    const handler = this.#loadHandlers.get(frame);
    if (handler) frame.removeEventListener("load", handler);
    this.#loadHandlers.delete(frame);
    this.#frameStates.delete(frame);
  }

  #emit(): void {
    const unique = new Map<string, DetectedApplication>();
    let academicHistory: AcademicHistoryModel = { state: "unavailable", courses: [] };
    let academicOffer: AcademicOfferModel = { state: "unavailable", offerings: [] };
    let registrationWindow: RegistrationWindowModel = { state: "unavailable" };
    let webPayments: WebPaymentsModel = { state: "unavailable" };
    let academicOfferLookup: AcademicOfferLookupModel | undefined;
    for (const state of this.#frameStates.values()) {
      unique.set(state.application.application, state.application);
      if (historyPriority(state.academicHistory) > historyPriority(academicHistory)) {
        academicHistory = state.academicHistory;
      }
      if (offerPriority(state.academicOffer) > offerPriority(academicOffer)) {
        academicOffer = state.academicOffer;
      }
      if (state.academicOffer.lookup
        && (!academicOfferLookup
          || offerLookupPriority(state.academicOffer.lookup) > offerLookupPriority(academicOfferLookup))) {
        academicOfferLookup = state.academicOffer.lookup;
      }
      if (registrationWindowPriority(state.registrationWindow)
        > registrationWindowPriority(registrationWindow)) {
        registrationWindow = state.registrationWindow;
      }
      if (webPaymentsPriority(state.webPayments) > webPaymentsPriority(webPayments)) {
        webPayments = state.webPayments;
      }
    }
    if (academicOfferLookup) academicOffer = { ...academicOffer, lookup: academicOfferLookup };
    const snapshot: RegistrySnapshot = {
      portalState: this.#portalState(),
      applications: Array.from(unique.values()),
      academicHistory,
      academicOffer,
      registrationWindow,
      webPayments,
    };
    const signature = JSON.stringify(snapshot);
    if (signature === this.#lastSnapshotSignature) return;
    this.#lastSnapshotSignature = signature;
    this.#listener(snapshot);
  }

  #portalState(): Exclude<PortalSurface, "unsupported" | "login"> {
    const documents = [this.#rootDocument, ...this.#documentObservers.keys()];
    const surfaces = documents.map((document) => detectPortalSurface(document).kind);
    if (surfaces.includes("session-expired")) return "session-expired";
    if (surfaces.includes("sap-error")) return "sap-error";
    return "portal-shell";
  }
}

function webPaymentsPriority(model: WebPaymentsModel): number {
  const priorities: Readonly<Record<WebPaymentsModel["state"], number>> = {
    results: 3,
    unknown: 2,
    unavailable: 1,
  };
  return priorities[model.state];
}

function registrationWindowPriority(model: RegistrationWindowModel): number {
  const priorities: Readonly<Record<RegistrationWindowModel["state"], number>> = {
    results: 3,
    unknown: 2,
    unavailable: 1,
  };
  return priorities[model.state];
}

function offerLookupPriority(model: AcademicOfferLookupModel): number {
  const priorities: Readonly<Record<AcademicOfferLookupModel["state"], number>> = {
    results: 4,
    empty: 3,
    initial: 2,
    unknown: 1,
  };
  return priorities[model.state];
}

function offerPriority(model: AcademicOfferModel): number {
  const priorities: Readonly<Record<AcademicOfferModel["state"], number>> = {
    results: 5,
    empty: 4,
    initial: 3,
    unknown: 2,
    unavailable: 1,
  };
  return priorities[model.state];
}

function historyPriority(model: AcademicHistoryModel): number {
  const priorities: Readonly<Record<AcademicHistoryModel["state"], number>> = {
    results: 5,
    empty: 4,
    initial: 3,
    unknown: 2,
    unavailable: 1,
  };
  return priorities[model.state];
}
