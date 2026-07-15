# BetterSirius: authenticated discovery report

Date: 2026-07-14  
Scope: passive inspection and low-risk, read-only navigation of the authenticated UNIMET Sirius student portal.

This report intentionally excludes student names, identifiers, grades, balances, academic-condition values, registration-window details, credentials, hidden-field values, cookies, browser storage, and session-bearing URLs.

## Executive conclusion

BetterSirius is technically feasible as a browser extension that runs only on `sirius.unimet.edu.ve`, keeps SAP as the system of record, and replaces the presentation and interaction layer with a responsive client-side shell.

The extension should not replay captured SAP requests. Sirius is composed of stateful SAP Portal and Web Dynpro applications whose live URLs and hidden form state contain per-session routing/security data. BetterSirius must locate the current live application state, parse the rendered result, and delegate intentional actions to the current SAP controls.

The highest-value first release is read-only: responsive navigation, academic history, current enrollment, schedule, registration-window status, and locally cached academic-offer search. Transactional registration should follow only after fixture-based testing and explicit confirmation boundaries.

## Verified platform and shell

- Server: SAP NetWeaver Application Server 7.53 / AS Java 7.40.
- Portal shell: SAP Enterprise Portal under `/irj/portal`.
- Embedded academic applications: SAP Web Dynpro for ABAP under `/sap/bc/webdynpro/sap/...`.
- The portal document runs in quirks mode (`BackCompat`).
- It has no `<meta name="viewport">`.
- Its layout is made from deeply nested tables and multiple nested iframes.
- Top-level navigation uses `href="#"`, JavaScript event wiring, and generated POST forms.
- SAP-generated element IDs vary and must not be treated as durable selectors.
- The page loads legacy SAP HTMLB/Unified Rendering assets and a Web Dynpro client bundle dated 2021.

At a 390×844 viewport, the portal did not reflow. It rendered a tiny fixed-width desktop interface with horizontal overflow. Responsive CSS cannot be limited to cosmetic overrides; BetterSirius needs its own layout shell.

## Portal hierarchy observed

Top-level tabs:

1. Información de Interés
2. Procesos Académicos
3. Procesos Administrativos
4. Seguridad
5. Repositorio Secretaría Gral.
6. Finanzas

The hierarchy is semantically unreliable:

- `Procesos Administrativos` contains student-payment functions such as early-payment discounts and the payment site.
- `Finanzas` contains institutional audited-financial-statement links rather than the student's account, and its observed default embedded target returned `Not Found`.

BetterSirius should reorganize features by user intent instead of copying this hierarchy.

### Academic navigation

The `Procesos Académicos > Pregrado` detailed navigation exposed:

- Matrícula Pregrado
- Trimestre Pregrado
- Consultas y Solicitudes
- Cursos en Línea
- Auditoría y Titulación
- La Voz del Estudiante
- Evaluación de preparadores

`Consultas y Solicitudes` exposed:

- Consulta Calificaciones Históricas
- Actualización Datos Personales
- Consulta de Calificaciones Período
- Solicitud de Correo UNIMET

`Trimestre Pregrado` exposed:

- Certificado Inscripción
- Retiro Asignaturas
- Horario del Estudiante Completo

`Matrícula Pregrado` exposed:

- Turno de Inscripción
- Oferta Académica
- Inscripción 2.0
- Instructivo

## Application fingerprints

### Historical grades

- Base application: `/sap/bc/webdynpro/sap/zweb_calificaciones`
- Document title identifies the historical-grade application.
- The initial state asks the user to select an academic program.
- The result state contains a period list and a course-grade table.
- Stable semantic headers include course code/name, grade symbol, approved/attempted credits, points, and comments.
- Generated IDs use `WD...` patterns and are not stable.
- Web Dynpro interactions are represented through `lsdata` and `lsevents`, not conventional HTML form buttons.

The portal menu item labelled `Consulta de Calificaciones Período` loaded the same underlying application and initial state during inspection. BetterSirius should fingerprint the actual embedded application and visible state rather than trust the portal title.

### Academic-offer search

- Base application: `/sap/bc/webdynpro/sap/zweb_oferta_1`
- One visible text criterion: course/subject code.
- One server-triggered search operation.
- No client-side filtering.
- No responsive viewport.
- Search results were not requested during this audit because no known course code was supplied and unnecessary backend requests were prohibited.

This is the best initial caching target. A successful result can be normalized into a local course-offering record and searched repeatedly without contacting SAP.

### Registration

- Base application: `/sap/bc/webdynpro/sap/zweb_matricula2`
- Three-step wizard:
  1. Study-plan selection
  2. Course selection
  3. Registration completion
- The initial state shows the applicable study plan and a `Continuar` action.
- The transactional action was not activated.
- The application exposes a distinct `Salir de la Inscripción` control.

This workflow must be modeled as an explicit state machine. BetterSirius must never automatically advance, retry, or submit a registration step.

### Current enrollment

The enrollment-certificate view exposes:

- Student summary
- Current enrolled-credit total
- Enrolled-subject table
- Enrollment-certificate action
- Withdrawal action

The withdrawal control was not activated. It must be treated as a destructive mutation requiring an action-time confirmation.

### Registration window

The registration-window view is read-only and reveals a student-specific start/end date and time. These values should be parsed into a local `RegistrationWindow` model, displayed prominently, and never logged remotely.

## State and session behavior

Each Web Dynpro application carries live state through:

- A session-bearing application URL
- A hidden SAP secure identifier
- A hidden stateful marker
- Large sets of `lsdata` and `lsevents` attributes

Consequences:

1. Never persist complete application URLs.
2. Never log URL path parameters or hidden-field values.
3. Never construct or replay Web Dynpro requests from stale captured data.
4. Rediscover the current iframe, application fingerprint, and live control before every delegated action.
5. Treat a replaced iframe as a new application instance.
6. Cache parsed domain objects, not SAP transport state.

The observed design is consistent with reports that an idle screen may lose valid server-side state even while the outer portal session appears alive. That failure mode still needs a controlled reproduction in a future session; it was not intentionally triggered here.

## Recommended extension architecture

### 1. Portal detector

A minimal content script restricted to:

- `http://sirius.unimet.edu.ve/irj/*`
- Any verified HTTPS equivalent if UNIMET enables one

It detects login, portal shell, SAP error, expired session, and supported embedded applications.

### 2. Responsive shell

A Shadow DOM application rendered above the legacy portal, with:

- Mobile-first navigation
- Dashboard cards
- Loading/skeleton states
- Explicit cached/live indicators
- Recovery UI
- A button to reveal the original SAP interface

The legacy page remains mounted so its live session and controls continue to function.

### 3. Frame/application registry

Track iframe replacement and fingerprint applications by stable base path and semantic headings:

- `zweb_calificaciones`
- `zweb_oferta_1`
- `zweb_matricula2`
- Additional applications discovered later

Do not identify applications using generated iframe window IDs or `WD...` control IDs.

### 4. Semantic adapters

Each adapter should expose:

```text
detect(document) -> confidence
readState(document) -> normalized domain model
locateAction(document, action) -> current live SAP element
classifyError(document) -> typed recoverable error
```

Selectors should prefer stable headings, table headers, accessible labels, application base paths, and known relationships between labels and controls.

### 5. Request governor

BetterSirius should reduce load rather than attempt to evade server limits:

- One active operation per Web Dynpro application.
- Single-flight deduplication for identical reads.
- Explicit search submission; no request per keystroke.
- Short circuit breaker after HTTP 500 or invalid-state responses.
- No speculative prefetching.
- No background keep-alive loop.
- Cautious retry only for clearly read-only operations.
- No automatic retry for registration, withdrawal, profile, document-generation, or payment actions.

### 6. Local cache

Use IndexedDB for normalized, non-transport data:

- Course catalog/offer results
- Academic periods
- Parsed academic history
- Schedule and enrollment summary

Every cache entry needs a data-type-specific TTL, `updatedAt`, schema version, and explicit stale label. Never cache passwords, cookies, hidden SAP fields, complete session URLs, or payment data.

## Safety invariants

- Never read or store the user's password.
- Preserve password-manager/autofill compatibility on the enhanced login form.
- Never transmit analytics by default.
- Never store SAP session tokens.
- Never inject into third-party payment frames.
- Never submit registration, withdrawal, payment, profile, email, or document-generation actions without an immediate explicit user confirmation.
- Never infer success from a click; verify the resulting SAP state.
- After an ambiguous failure, stop instead of retrying.
- Always provide access to the untouched original UI.

## MVP recommendation

Phase 1 should be fully read-only:

1. Responsive login enhancement using the original form fields.
2. Responsive portal navigation.
3. Registration-window card.
4. Academic-history viewer.
5. Current-enrollment summary.
6. Schedule viewer.
7. Academic-offer search with conservative local caching.
8. Session/error detection and state restoration.

Phase 2 can add a registration planner that remains local and performs no SAP mutation.

Phase 3 can delegate actual registration only after the three-step workflow is captured with sanitized fixtures and tested outside a consequential live enrollment period.

## Remaining discovery work

The following states remain intentionally untested:

- Course-offer search result, empty result, validation error, timeout, and HTTP 500 states
- Historical-grade empty state and multi-program state
- Schedule result schema
- Session-expired and reauthentication recovery
- Registration steps 2 and 3
- Successful, rejected, duplicate, prerequisite, capacity, and schedule-conflict registration responses
- Payment-site boundary and return flow
- Login form DOM under mobile user-agent rejection
- HTTPS availability and university-supported secure access

For the next safe audit, use one known course code supplied by the user, perform one search, and capture only the sanitized result schema and timing. Transactional registration steps should not be exercised on the user's live account merely for discovery.
