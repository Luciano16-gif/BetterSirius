# Architecture

## Trust boundary

BetterSirius is a presentation layer, not an alternate Sirius client. The only authoritative state is the page SAP already rendered. The extension does not reconstruct, persist, or replay Web Dynpro requests.

```text
Current Sirius document
  -> portal detector (semantic, read-only)
  -> allowlisted academic-process detector
  -> iframe registry (replacement-aware, no URL persistence)
  -> application detector / passive adapter
  -> fixture-tested read parser
  -> normalized in-memory domain model
  -> BetterSirius Shadow DOM shell

Unknown or ambiguous state
  -> untouched Sirius interface
```

## Components

- `src/content`: validates the exact runtime scope and coordinates startup.
- `src/academic`: exposes the audited academic-process catalog and parses compatible historical-grade tables through stable semantic headers. It never reads hidden fields or transport attributes.
- `src/detection`: recognizes portal and application state through stable paths, headings, labels, and table headers. Generated `WD...` IDs are never selectors.
- `src/registry`: rescans current iframe instances and discards state when an iframe is replaced.
- `src/navigation`: performs the single supported user-triggered read navigation by rediscovering exact semantic menu labels before each click. It never reads or replays transport state.
- `src/adapters`: establishes the future adapter contract (`detect`, `readState`, `locateAction`, `classifyError`). MVP action location is deliberately inert.
- `src/ui`: renders the responsive shell in Shadow DOM without unmounting or rewriting SAP.
- `src/safety`: enforces the exact observed host and portal path at runtime.

The application fingerprint model retains only a small application enum, screen-state enum, and confidence value. The academic-process model emits only fixed catalog constants plus a presence boolean. The history model temporarily retains only normalized visible table cells required by the UI. No model retains a full URL, hidden field, session identifier, or SAP transport state, and nothing is persisted.

## Failure behavior

- Unknown top-level pages are not enhanced.
- Unrecognized application states are labeled unknown instead of guessed.
- Cross-origin iframe paths are ignored.
- Missing or duplicate navigation labels stop the read navigation instead of guessing.
- SAP errors stop at a visible error state; no retry is available.
- Session expiry directs the user to the original UI.
- The original page stays mounted, and switching views changes only the extension overlay.

## Visual identity

The shell uses UNIMET blue (`#003087`, `#1859A9`) for its primary navigation surfaces and orange (`#F68629`, `#FF8200`) as the action and status accent. This keeps the university palette recognizable without allowing the most saturated color to dominate the workspace. BetterSirius remains unofficial and does not recreate or modify the protected university logo; its own wordmark and simple `B` marker remain visually distinct.
