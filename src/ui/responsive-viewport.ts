const RESPONSIVE_VIEWPORT_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";

export interface ResponsiveViewportController {
  activate(): void;
  deactivate(): void;
  dispose(): void;
}

/**
 * Sirius does not consistently declare a mobile viewport. Without one, mobile
 * browsers lay the document out at a desktop width and merely scale it down,
 * so BetterSirius' responsive breakpoints never run.
 *
 * This controller changes only the generic viewport declaration while the
 * enhanced UI is visible and restores the exact original declaration whenever
 * the user returns to SAP.
 */
export function createResponsiveViewport(document: Document): ResponsiveViewportController {
  const originalMeta = document.head?.querySelector<HTMLMetaElement>('meta[name="viewport" i]') ?? null;
  const originalContent = originalMeta?.getAttribute("content") ?? null;
  let activeMeta: HTMLMetaElement | null = null;
  let active = false;

  const activate = (): void => {
    if (active || !document.head) return;

    const meta = originalMeta?.isConnected ? originalMeta : document.createElement("meta");
    if (!meta.isConnected) {
      meta.setAttribute("name", "viewport");
      document.head.append(meta);
    }
    meta.setAttribute("content", RESPONSIVE_VIEWPORT_CONTENT);
    activeMeta = meta;
    active = true;
  };

  const deactivate = (): void => {
    if (!active) return;

    if (originalMeta && activeMeta === originalMeta) {
      if (originalContent === null) originalMeta.removeAttribute("content");
      else originalMeta.setAttribute("content", originalContent);
    } else {
      activeMeta?.remove();
    }
    activeMeta = null;
    active = false;
  };

  return { activate, deactivate, dispose: deactivate };
}
