# Development workflow

## Commands

- `npm run typecheck`: strict TypeScript validation.
- `npm test`: fixture-only unit tests under JSDOM with network APIs disabled.
- `npm run build`: bundles the content script and validates the output manifest policy.
- `npm run verify`: runs typecheck, tests, and the production build.
- `npm run preview`: serves only the synthetic UI preview on port 4173.

## Fixture rules

Fixtures under `tests/fixtures` must be hand-authored and synthetic. Never copy HTML from a live session, even after visually removing personal data: page source can contain secure IDs, hidden fields, routing fragments, or identifiers outside the visible region.

Do not add session-bearing Sirius URLs to fixtures or network calls. The exact origin used by the runtime-policy test and the single base application paths in source are non-session fingerprints documented by the sanitized discovery report. Never add path parameters, query strings, fragments, hidden values, or captured `lsdata`/`lsevents` payloads.

## Adding support safely

1. Define the normalized state without transport data.
2. Add any accepted portal label to an explicit allowlist; never expose arbitrary page text through BetterSirius.
3. Create synthetic fixtures for initial, loading, empty, success, validation, expired-session, and server-error states as applicable.
4. Add semantic detection/parsing tests before adapter code.
5. Keep unknown-state behavior explicit.
6. Read-only navigation delegation requires an exact semantic allowlist, one user-triggered operation, no retry, and a fixture covering every menu step. A supported read criterion may be copied only into its current visible SAP control immediately before the user-requested action; hidden state and mutation delegation remain prohibited.
7. Login presentation may only reuse the native username, password, and submit controls inside their existing form. Never read `.value`, attach credential input listeners, clone credential fields, create an alternative request, or invoke form submission from extension code.
8. Run `npm run verify` and visually inspect all preview states.

Academic-offer fixtures must cover initial, results, and empty tables plus the value-help initial, result, and empty states. All codes, names, schedules, capacities, prerequisite text, modalities, and costs must be synthetic. Do not paste a live result row into a fixture.

No automated command in this repository may open or contact Sirius.
