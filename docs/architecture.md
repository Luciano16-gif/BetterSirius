# Architecture

## Trust boundary

BetterSirius is a presentation layer, not an alternate Sirius client. The only authoritative state is the page SAP already rendered. The extension does not reconstruct, persist, or replay Web Dynpro requests.

```text
Current Sirius document
  -> portal detector (semantic, read-only)
  -> native login presentation (same form and controls; no value access)
  -> allowlisted academic-process detector
  -> iframe registry (replacement-aware, no URL persistence)
  -> application detector / passive adapter
  -> fixture-tested grade / academic-offer parser
  -> explicit read-only action governor
  -> normalized in-memory domain model
  -> BetterSirius Shadow DOM shell

Unknown or ambiguous state
  -> untouched Sirius interface
```

## Components

- `src/content`: validates the exact runtime scope and coordinates startup.
- `src/login`: presents the native Sirius login controls responsively without cloning fields, reading values, or submitting the form programmatically.
- `src/academic`: parses compatible historical-grade, academic-offer, and offer value-help tables through stable semantic headers. The offer controller accepts an explicit course code or opens Sirius's visible name-or-code selector. A lookup requires an explicit search, an exact code/name row match, and one visible offer search; it never reads hidden fields or transport attributes.
- `src/detection`: recognizes portal and application state through stable paths, headings, labels, and table headers. Generated `WD...` IDs are never selectors.
- `src/registry`: rescans current iframe instances and discards state when an iframe is replaced.
- `src/navigation`: performs the single supported user-triggered read navigation by rediscovering exact semantic menu labels before each click. It never reads or replays transport state.
- `src/adapters`: establishes the future adapter contract (`detect`, `readState`, `locateAction`, `classifyError`). MVP action location is deliberately inert.
- `src/ui`: renders the responsive shell in Shadow DOM without unmounting or rewriting SAP.
- `src/safety`: enforces the exact observed host and portal path at runtime.

The application fingerprint model retains only a small application enum, screen-state enum, and confidence value. The academic-process model emits only fixed catalog constants plus a presence boolean. History and academic-offer models temporarily retain normalized visible cells required by the UI. No model retains a full URL, hidden field, session identifier, or SAP transport state, and nothing is persisted.

## Failure behavior

- Unknown top-level pages are not enhanced.
- An incomplete or unrecognized login form is left untouched.
- Unrecognized application states are labeled unknown instead of guessed.
- Cross-origin iframe paths are ignored.
- Missing or duplicate navigation labels stop the read navigation instead of guessing.
- A missing, duplicate, or replaced academic-offer or value-help control stops the search; no request is reconstructed or retried.
- SAP errors stop at a visible error state; no retry is available.
- Session expiry directs the user to the original UI.
- The original page stays mounted, and switching views changes only the extension overlay.

## Visual identity

The shell uses UNIMET blue (`#003087`, `#1859A9`) for its primary navigation surfaces and orange (`#F68629`, `#FF8200`) as the action and status accent. This keeps the university palette recognizable without allowing the most saturated color to dominate the workspace. BetterSirius remains unofficial and does not recreate or modify the protected university logo; its own wordmark and simple `B` marker remain visually distinct.
