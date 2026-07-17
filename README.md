# BetterSirius

BetterSirius is an unofficial, open-source browser extension that adds a responsive, read-only interface over UNIMET's legacy Sirius portal. SAP remains mounted underneath and remains the system of record.

The current MVP foundation includes a responsive sign-in presentation, functional grade reading, and academic-offer search. Sign-in reuses Sirius's native username, password, and submit controls inside the original form, preserving browser autofill without reading or storing credential values. Explicit actions traverse exact, allowlisted Sirius menu labels. Grade queries share one safe reader for programs, withdrawn-course display, periods, and course results. `Oferta Académica` supports direct course-code queries plus Sirius's native name-or-code value help, including prefix searches such as `FGE`; an exact selected result is then delegated to the visible offer search once. The rendered 12-column response becomes responsive section rows for schedule, capacity, modality, prerequisites, and first-month cost. It does not yet display the student's schedule, balances, registration-window values, or statistics; contact Sirius independently; persist student information; or delegate mutating academic actions.

## Safety boundary

- Runs only on the observed `http://sirius.unimet.edu.ve/irj/*` scope.
- Has no background service worker, telemetry, remote code, or network API usage.
- Never persists complete URLs, cookies, hidden fields, SAP secure IDs, or Web Dynpro transport state.
- Never reads or copies login input values. The user activates Sirius's existing submit control and form directly.
- Keeps parsed academic-history values in memory only and removes them with the page.
- Delegates only explicit read interactions already visible in Sirius: grade-query navigation and selection, plus one academic-offer search per user submission. It never submits mutating academic forms, retries automatically, prefetches, searches per keystroke, or keeps a session alive.
- Falls back to Sirius original when the state is unknown.
- Uses only synthetic local HTML in automated tests.

Read [the threat model](docs/threat-model.md) before expanding the scope. The authenticated architecture observations are recorded in [the sanitized discovery report](docs/discovery-report.md).

## Local development

Requirements: Node.js 22 or newer.

```sh
npm install
npm run verify
npm run preview
```

The synthetic preview runs at `http://localhost:4173`. Open `/login.html` for sign-in, `?panel=history` for history, `?inquiry=period` for period grades, `?panel=academic` for the process catalog, or `?panel=offer` for academic-offer results. Offer-specific states include `?panel=offer&state=offer-loading` and `?panel=offer&state=offer-empty`. The preview contains no live portal content and makes no Sirius requests.

After `npm run build`, load `dist/` as an unpacked extension in a Chromium browser. Do not exercise it against a live account as part of automated testing.

Licensed under the [MIT License](LICENSE).
