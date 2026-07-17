# Threat model and privacy invariants

## Protected assets

Academic records, identity information, balances, registration windows, credentials, cookies, browser storage, SAP secure IDs, hidden Web Dynpro fields, session-bearing URLs, and any action that can alter university state are sensitive.

## Primary risks

1. Leaking session or student data through logs, telemetry, caches, source maps, fixtures, or bug reports.
2. Submitting or replaying a stateful SAP request from stale or ambiguous state.
3. Misidentifying generated SAP controls after a rerender or iframe replacement.
4. Increasing load on a slow backend through retries, prefetching, polling, or request-per-keystroke behavior.
5. Obscuring an error and presenting parsed data as authoritative when SAP state is unknown.

## Enforced MVP invariants

- No runtime network primitive is present in extension source.
- No background process exists.
- The manifest grants only the observed HTTP Sirius portal scope. HTTPS is intentionally absent until its availability is verified separately and explicitly.
- No academic SAP form is submitted programmatically. Delegation is limited to explicit reads: the two observed grade-query entries and `Oferta Académica`. Offer search either copies one user-entered course code into the current visible criterion or uses the visible name-or-code value help. Lookup searches occur only on submit; selection requires an exact visible code/name match and activates the visible offer search once. There is no automatic retry or request-per-keystroke behavior.
- Sign-in reuses the existing Sirius username field, password field, submit control, and containing form. BetterSirius moves those DOM nodes only for presentation, never reads their values, never attaches input listeners, never creates a credential request, and never invokes form submission programmatically.
- Complete URLs and hidden state never enter the domain model, cache, or logs.
- No credentials are read. Browser autofill targets the same native fields, and submission occurs only through the user's direct interaction with the native Sirius control. Supported academic values are read only from an already rendered compatible result table and remain in page memory.
- Academic-process detection emits fixed catalog constants and a presence boolean; arbitrary portal text is discarded.
- Parsed history and academic-offer cells are HTML-escaped before rendering and are never logged or persisted.
- Tests globally fail if code attempts `fetch`, XHR, WebSocket, or beacon traffic.
- Tests scan extension source for network and form-submission primitives.
- Only synthetic, sanitized fixtures are accepted in the test suite.
- The original portal remains available from every enhanced state.
- Ambiguous state fails open to the original interface.

## Out of scope

Registration, add/drop or withdrawal mutations, payment, password changes/security management, profile, email, document generation, academic-data caching, and any other live-page action delegation are intentionally unimplemented. Showing already-recorded withdrawn courses is a read filter, not a withdrawal action. A future change to any mutating area requires a separate threat-model update, sanitized fixtures for every known outcome, and explicit confirmation boundaries before any live validation.
