# ERP Homepage TODO

## Priority 1

- [x] Replace the root redirect with a real ERP control-center home page.
- [x] Preserve the existing `/propig` dashboard as a direct module entry.
- [x] Normalize garbled Korean labels in shared navigation, header, propig store metadata, quick links, and YouTube category metadata.
- [x] Add role-aware empty states for unauthenticated and guest users on the ERP home.

## Priority 2

- [x] Connect the ERP home metrics to live Firestore/admin data instead of static summary values.
- [x] Add a cross-module search/command launcher for pages, file/user/recent-work entry points.
- [x] Extend the launcher with live record-level search for Storage files, users, and activity logs.
- [x] Surface recent activity logs and pending admin actions on the home page.
- [x] Add quick filters for Admin, Corporate, Personal Workflow, and AI Operations.

## Priority 3

- [x] Add Playwright screenshot checks for desktop and mobile home layouts.
- [x] Tune mobile hero typography and action wrapping from screenshot QA.
- [x] Audit focus order and keyboard navigation for the new root dashboard.
- [x] Add reduced-motion and high-contrast QA notes to the release checklist.
- [x] Defer heavy admin/media modules with route-level dynamic loading where bundle data shows a win.
- [x] Clean existing ESLint warnings in `HabitTrackerApp.tsx` so `npm run lint -- --max-warnings=0` can become a reliable gate.
- [x] Review and clear the Turbopack NFT warning from `src/lib/firebase-admin.ts` imports in admin API routes.

## Priority 4

- [x] Add a local personalized workspace with pinned modules and recently visited module tracking.
- [x] Extend ERP home verification to cover pinned-module persistence and personalized workspace layout.
- [x] Persist ERP home preferences server-side for signed-in users so pins follow the account across devices.
- [x] Add lightweight usage telemetry for command launcher execution and pinned-module navigation.

## Priority 5

- [x] Label ERP home telemetry events clearly in Admin Pulse and the admin activity-log screen.
- [x] Add a compact usage-insights panel for the most used ERP home modules and commands.
- [x] Add a preference reset action for clearing local/server-persisted home personalization.

## Priority 6

- [x] Show clear local/server sync status for ERP home personalization.
- [x] Surface sync failures without blocking local pinned-module behavior.
- [x] Add automated coverage for personalization sync status and reset affordances.

## Priority 7

- [x] Add admin activity-log drilldown filters for ERP home module-open and command-executed events.
- [x] Add an empty-state guide for first-time administrators when there are no ERP home usage insights yet.
- [x] Re-run bundle evidence after personalization and activity-log additions to confirm root payload remains controlled.

## Priority 8

- [x] Highlight the activity-log row referenced by the `log` query parameter.
- [x] Add cursor pagination controls to the admin activity-log screen.
- [x] Add a saved recent-command strip to the ERP command launcher.

## Priority 9

- [x] Add a clear-history affordance for the ERP command launcher's recent commands.
- [x] Persist activity-log scope/action/search filters in the URL for shareable admin views.
- [x] Add a focused admin activity-log browser verification path when authenticated test state is available.

## Priority 10

- [x] Replace stale static Admin Pulse tasks with a state-derived operational readiness queue.
- [x] Persist the selected ERP home domain filter so returning users keep their preferred module view.
- [x] Add browser verification for operational readiness copy and stale-task removal.

## Priority 11

- [x] Trap keyboard focus inside the ERP command launcher while it is open.
- [x] Restore focus to the launcher trigger when the dialog closes without navigation.
- [x] Wire command results to the search input with `aria-activedescendant`.
- [x] Add browser verification for command launcher focus containment and active option linkage.

## Priority 12

- [x] Move admin activity-log `scope`, `action`, and text search filtering into the server API.
- [x] Include a highlighted `log` query target in the first result page when it matches the active filters.
- [x] Surface server scan/filter metadata in the admin activity-log summary strip.
- [x] Add browser verification for server-filtered admin activity-log URLs.

## Priority 13

- [x] Add an accessible active-filter status bar to the admin activity-log screen.
- [x] Add a single reset action that clears search, scope, action, pagination, and highlighted log state.
- [x] Keep the `log` query parameter in sync so reset removes stale highlight targets from shareable URLs.
- [x] Add authenticated browser verification for the active-filter status bar.

## Priority 14

- [x] Extract admin activity-log query matching into a pure contract-tested module.
- [x] Add fake-data verification for server-side scope/action/search filtering.
- [x] Add fake-data verification for highlighted-log insertion without cursor gaps.
- [x] Add the activity-log query contract check to the release checklist.

## Priority 15

- [x] Add a persisted comfortable/compact density mode to the admin activity-log screen.
- [x] Improve activity-log row metadata hierarchy for faster scanning on desktop and mobile.
- [x] Add authenticated browser verification for density persistence when test state is available.
- [x] Add density/readability checks to the release checklist.

## Priority 16

- [x] Run the admin activity-log browser verifier across desktop and mobile viewports.
- [x] Capture per-viewport admin activity-log screenshots for access and authenticated states.
- [x] Add mobile overflow/readability assertions for activity-log filters, density controls, and log rows.
- [x] Document the mobile admin activity-log screenshots in the release checklist.

## Priority 17

- [x] Add automated bounding-box evidence checks for key ERP home layout regions.
- [x] Add automated bounding-box evidence checks for admin activity-log access and authenticated layouts.
- [x] Fail browser verification when key regions overlap or extend outside the viewport.
- [x] Document bounding-box layout evidence in the release checklist.

## Priority 18

- [x] Add corrupted Korean text detection to the admin activity-log browser verifier.
- [x] Verify required admin activity-log copy in access and authenticated states.
- [x] Document admin activity-log text integrity checks in the release checklist.

## Priority 19

- [x] Defer admin photo create/edit, AI import, and bulk upload modal bundles until the user opens them.
- [x] Keep the `/admin/photos` album and converter workflows functionally unchanged while reducing initial route work.
- [x] Document the admin photo tooling performance follow-up.

## Priority 20

- [x] Add desktop/mobile browser smoke verification for `/admin/photos`.
- [x] Verify photo album and image converter tabs for Korean copy, horizontal overflow, and key control bounds.
- [x] Capture admin photo album/converter screenshots for release review.
- [x] Add the admin photo verifier to package scripts and the release checklist.

## Priority 21

- [x] Add desktop/mobile browser verification for the main corporate content pages.
- [x] Verify corporate page Korean copy, horizontal overflow, and key heading/CTA bounds.
- [x] Capture corporate page screenshots for release review.
- [x] Add the corporate page verifier to package scripts and the release checklist.

## Priority 22

- [x] Reduce the mobile business-area hero height so the next section is visible earlier.
- [x] Preserve the business-area CTA, active-area status panel, and desktop hero layout.
- [x] Re-run corporate browser verification after the responsive design adjustment.

## Priority 23

- [x] Convert the mobile project-board category filter from clipped horizontal chips to a two-column responsive grid.
- [x] Extend corporate browser verification to assert individual project category filters stay inside the viewport.
- [x] Re-check the project-board mobile screenshot after the category filter layout fix.

## Priority 24

- [x] Add `content-visibility: auto` to project-board card, plan-stage, and task-row repeaters.
- [x] Add intrinsic size hints so off-screen project-board content can defer layout/paint safely.
- [x] Extend corporate browser verification to prove project-board performance regions use the optimized rendering style.

## Priority 25

- [x] Add `content-visibility: auto` and intrinsic size hints to staff org nodes and collaboration-flow steps.
- [x] Improve the staff profile drawer with close-button focus, `Escape` close, Tab loop handling, and focus restoration.
- [x] Extend corporate browser verification to cover staff drawer keyboard behavior and staff performance regions.

## Priority 26

- [x] Capture the staff-intro base page screenshot before drawer interaction changes scroll position.
- [x] Capture staff profile drawer interaction screenshots as separate release evidence.
- [x] Reset corporate verifier scroll containers before standard page screenshots.
- [x] Wait for staff-intro motion content to become visually opaque before taking release screenshots.
- [x] Include inherited opacity in corporate page layout visibility checks.

## Priority 27

- [x] Add screenshot-probe pixel contrast checks to corporate page visual verification.
- [x] Verify staff profile drawer screenshots only after the slide-in panel settles into the viewport.
- [x] Analyze screenshot probe regions in an isolated Canvas so page reload timing cannot invalidate the PNG check.

## Priority 28

- [x] Move screenshot-probe pixel analysis into a shared verification utility.
- [x] Reuse the screenshot quality utility in `verify:erp-home`.
- [x] Verify ERP home screenshots around the primary title probe instead of relying only on PNG file size.

## Priority 29

- [x] Reuse the screenshot quality utility in `verify:admin-photos`.
- [x] Verify the admin photos album screenshot around the visible album tab.
- [x] Verify the admin photos converter screenshot around the converter studio title.

## Priority 30

- [x] Reuse the screenshot quality utility in `verify:admin-activity`.
- [x] Verify admin activity access-state screenshots around the active access heading.
- [x] Verify authenticated admin activity screenshots around the Activity logs heading when storage state is provided.

## Priority 31

- [x] Add a development-only admin activity fixture user for browser verification without saved auth storage.
- [x] Intercept the activity-log API in `verify:admin-activity` and return deterministic fixture logs with real URL filter behavior.
- [x] Run authenticated admin activity UI checks by default after the access-state checks.
- [x] Tighten the storage-state path so a provided but invalid admin storage state fails instead of silently passing the access screen.
- [x] Improve mobile authenticated activity logs density so scope filters, summary metrics, and the first log evidence fit better in the first viewport.

## Priority 32

- [x] Add a development-only admin storage fixture user for browser verification without saved auth storage.
- [x] Add `verify:admin-storage` with access-state and authenticated Storage Drive fixture coverage.
- [x] Intercept the admin storage API in browser verification for deterministic inventory and signed-preview URL responses.
- [x] Verify Storage Drive search filtering, selected-file detail state, folder-dialog validation, layout bounds, and screenshot pixel contrast.
- [x] Improve mobile Storage Drive density by keeping summary metrics in a compact two-column grid.

## Priority 33

- [x] Add a development-only admin users fixture user for browser verification without saved auth storage.
- [x] Add `verify:admin-users` with access-state and authenticated user-management fixture coverage.
- [x] Intercept the admin users API in browser verification for deterministic users, storage status, and PATCH responses.
- [x] Verify user search, role filtering, editable position persistence, responsive layout bounds, and screenshot pixel contrast.

## Notes

The current highest-risk gap is not data modeling, but first-impression clarity: `/` previously redirected into a personal dashboard, so users could not understand the ERP surface before entering a module. The new home page creates a stable operational starting point while keeping existing routes intact.

Bundle follow-up: `habit-tracker` previously had the largest route-specific client cost at about 731 KB uncommon payload per habit route, including a shared Recharts-heavy 644 KB chunk. The four habit routes now use a small dynamic route wrapper so the full tracker app is fetched after the route shell loads. The next largest candidates are corporate content pages and admin photo tooling, but their route-specific chunks are materially smaller.

Latest bundle check: after adding personalization sync status, ERP home telemetry, activity-log drilldowns, and usage-insight empty states, the root `page` route reports about 78 KB uncommon payload. The route remains below the current heavy candidates such as corporate content, `admin/photos`, and workflow tools.

Admin photo follow-up: the image converter was already dynamically loaded; the remaining photo create/edit, AI import, and bulk upload modals now load only when opened so the album management route does not pay for those tools on first render.

Corporate content follow-up: `/corp`, company introduction, business area, staff intro, CEO intro, project board, and portfolio now have desktop/mobile browser verification so future design and performance work can be checked against real rendered pages.

Business-area mobile design follow-up: the first hero card no longer reserves a 660px mobile minimum height, so the `Business Cards` section is visible in the first scroll position while the animated globe atmosphere and active-area panel remain intact.

Project-board mobile follow-up: read-only category filters now wrap into a compact two-column grid on mobile, preventing the final chips from looking clipped while keeping management-mode category editing unchanged.

Project-board performance follow-up: repeated board cards, plan stages, and task rows now use browser-level content visibility with intrinsic size hints. The verifier checks the rendered project-board regions so the optimization does not silently disappear.

Staff-intro follow-up: organization nodes and collaboration-flow cards now defer off-screen rendering, and the profile drawer behaves like a keyboard-owned dialog by focusing the close button, trapping Tab within visible drawer controls, closing on `Escape`, and restoring focus to the originating profile card.

Staff-intro screenshot follow-up: corporate verification now keeps `staff-intro-desktop/mobile.png` as base page evidence and writes drawer interaction evidence to `staff-intro-drawer-desktop/mobile.png`, so visual QA can review both states independently. The verifier waits for the staff motion wrapper to become visually opaque before checking layout or screenshots, preventing empty first-frame captures from passing.

Corporate screenshot-quality follow-up: `verify:corp-pages` now samples the rendered PNG around each page's primary visual probe and fails when the probe region is too flat or too low-contrast. This catches empty, transparent, or animation-first-frame screenshots even when the DOM and file size look valid.

ERP home screenshot-quality follow-up: screenshot pixel analysis now lives in `scripts/screenshot-quality.mjs` and is reused by `verify:erp-home`, so the primary home title must be visibly present in the captured PNG before the gate passes.

Admin photos screenshot-quality follow-up: `verify:admin-photos` now checks visible pixel contrast for both album and converter captures, so blank tab states or unloaded converter screenshots cannot pass on file size alone.

Admin activity screenshot-quality follow-up: `verify:admin-activity` now uses the same pixel probe utility for access-state screenshots by default, and applies it to authenticated screenshots when `ADMIN_ACTIVITY_LOGS_STORAGE_STATE` is provided.

Admin activity fixture follow-up: `verify:admin-activity` now verifies both the unauthenticated access state and an authenticated UI fixture without requiring saved browser storage. The fixture keeps production auth untouched, only activates through a development query parameter, and still exercises URL filter restoration, API query parameters, missing highlighted-log notices, density persistence, pagination controls, screenshot contrast checks, and mobile layout bounds.

Admin storage fixture follow-up: `verify:admin-storage` now covers the login/access screen and an authenticated Storage Drive fixture by default. It exercises deterministic inventory data, signed preview URL loading, search filtering, file selection details, invalid folder-name validation, responsive layout bounds, and screenshot contrast checks without weakening the production admin API.

Admin users fixture follow-up: `verify:admin-users` now covers the login/access screen and an authenticated user-management fixture by default. It exercises deterministic user records, admin API token enforcement, search filtering, role filtering, editable position persistence, responsive layout bounds, and screenshot contrast checks without weakening the production admin API.
