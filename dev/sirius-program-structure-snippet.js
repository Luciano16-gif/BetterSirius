// Paste this whole function into DevTools Console while the historical-grade
// program picker is visible. It reports only visible labels and structural
// flags; it never returns IDs, URLs, values, lsdata/lsevents contents, forms,
// hidden fields, cookies, or browser storage.
(() => {
  const clean = (value) => (value ?? "").replace(/\s+/g, " ").trim();
  const documents = [];
  const visited = new Set();

  const visit = (document, depth) => {
    if (!document || visited.has(document)) return;
    visited.add(document);

    const prompt = Array.from(document.querySelectorAll("label,span,td,div"))
      .find((element) => clean(element.textContent).toLowerCase().includes("seleccione un programa"));
    const container = prompt?.closest("tr,td,fieldset,div,table") ?? prompt?.parentElement;
    const controls = container
      ? Array.from(container.querySelectorAll(
          "[role='combobox'],[role='listbox'],[role='option'],[aria-haspopup='listbox'],button,input,select,[lsdata],[lsevents]",
        )).map((element) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          type: element.getAttribute("type"),
          classes: Array.from(element.classList).slice(0, 8),
          visibleText: clean(element.textContent).slice(0, 180),
          ariaLabel: clean(element.getAttribute("aria-label")).slice(0, 120),
          hasLsdata: element.hasAttribute("lsdata"),
          hasLsevents: element.hasAttribute("lsevents"),
        }))
      : [];

    if (prompt || controls.length) {
      documents.push({ depth, prompt: clean(prompt?.textContent).slice(0, 180), controls });
    }
    for (const frame of document.querySelectorAll("iframe")) {
      try { visit(frame.contentDocument, depth + 1); } catch {}
    }
  };

  visit(document, 0);
  const sanitized = JSON.stringify(documents, null, 2);
  console.log(sanitized);
  return sanitized;
})();
