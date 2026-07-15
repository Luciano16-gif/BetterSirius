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
- No SAP form is submitted. Delegation is limited to explicit reads from the two observed grade-query entries: exact allowlisted menu steps, one visible program row, the local withdrawn-course display checkbox, and one visible academic-period row per user choice. Both entries share the same fingerprinted application, and there is no automatic retry.
- Complete URLs and hidden state never enter the domain model, cache, or logs.
- No credentials are read. Supported academic values are read only from an already rendered compatible result table and remain in page memory.
- Academic-process detection emits fixed catalog constants and a presence boolean; arbitrary portal text is discarded.
- Parsed history cells are HTML-escaped before rendering and are never logged or persisted.
- Tests globally fail if code attempts `fetch`, XHR, WebSocket, or beacon traffic.
- Tests scan extension source for network and form-submission primitives.
- Only synthetic, sanitized fixtures are accepted in the test suite.
- The original portal remains available from every enhanced state.
- Ambiguous state fails open to the original interface.

## Out of scope

Registration, add/drop or withdrawal mutations, payment, password/security, profile, email, document generation, login enhancement, academic-data caching, and any other live-page action delegation are intentionally unimplemented. Showing already-recorded withdrawn courses is a read filter, not a withdrawal action. A future change to any mutating area requires a separate threat-model update, sanitized fixtures for every known outcome, and explicit confirmation boundaries before any live validation.
