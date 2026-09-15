# ERP Homepage Release Checklist

Use this checklist before shipping changes to the ERP home surface at `/`.

## Required Automated Gates

- [ ] `npm run verify:erp-home`
  - Captures desktop and mobile screenshots.
  - Verifies the primary title probe has enough pixel contrast in the captured PNG.
  - Verifies required ERP home text, horizontal overflow, corrupted Korean text, keyboard access, reduced-motion behavior, and forced-colors behavior.
  - Verifies local pinned-module persistence and personalized workspace layout.
  - Verifies key ERP home regions stay inside the viewport and do not overlap.
- [ ] `npm run verify:admin-activity`
  - Verifies the admin activity-log access state and a development-only authenticated fixture by default.
  - With `ADMIN_ACTIVITY_LOGS_STORAGE_STATE`, verifies authenticated filter URL restoration, server-filter API query parameters, missing-log highlight notice, and pagination controls.
  - Fails if `ADMIN_ACTIVITY_LOGS_STORAGE_STATE` is provided but still renders the access state.
  - Verifies access/authenticated layout regions stay inside the viewport and do not overlap on desktop and mobile.
  - Verifies admin activity-log Korean copy is not corrupted in access/authenticated states.
  - Verifies access/authenticated screenshot probe regions have enough pixel contrast.
- [ ] `npm run verify:admin-storage`
  - Verifies the admin storage access state and a development-only authenticated Storage Drive fixture by default.
  - Verifies deterministic inventory loading, signed preview URL requests, search filtering, selected-file details, and folder-dialog validation.
  - Verifies access/authenticated layout regions stay inside the viewport and do not overlap on desktop and mobile.
  - Verifies access/authenticated screenshot probe regions have enough pixel contrast.
- [ ] `npm run verify:admin-users`
  - Verifies the admin users access state and a development-only authenticated user-management fixture by default.
  - Verifies deterministic user loading, search filtering, role filtering, editable position persistence, and API token enforcement.
  - Verifies access/authenticated layout regions stay inside the viewport and do not overlap on desktop and mobile.
  - Verifies access/authenticated screenshot probe regions have enough pixel contrast.
- [ ] `npm run verify:admin-photos`
  - Captures desktop/mobile screenshots for the photo album and image converter tabs.
  - Verifies `/admin/photos` Korean copy, horizontal overflow, and key control bounds.
  - Verifies album and converter screenshot probe regions have enough pixel contrast.
- [ ] `npm run verify:corp-pages`
  - Captures desktop/mobile screenshots for `/corp`, company, project, and portfolio pages.
  - Verifies corporate page Korean copy, horizontal overflow, and key heading/CTA bounds.
  - Waits for motion-wrapped staff content to become visually opaque before screenshot capture.
  - Verifies screenshot probe regions have enough pixel contrast to catch blank or animation-first-frame captures.
  - Verifies project-board repeated content regions keep `content-visibility` rendering optimization.
  - Verifies staff-intro repeated content regions and profile drawer keyboard behavior.
- [ ] `npm run verify:activity-log-query`
  - Verifies server-side activity-log scope/action/search filtering and highlighted-log insertion with deterministic fake data.
- [ ] `npm run lint -- --max-warnings=0`
- [ ] `npm run type-check`
- [ ] `npm run build:next`

## Accessibility And Motion QA

- [ ] Reduced motion: verify `prefers-reduced-motion: reduce` removes section and command-launcher entrance animations.
- [ ] High contrast: verify `forced-colors: active` removes decorative backgrounds, preserves visible borders, and keeps primary commands readable.
- [ ] Keyboard: verify `Control+K` opens command search, the search input receives focus, arrow keys keep one active result, and `Escape` closes the dialog.
- [ ] Focus visibility: verify primary links, domain filters, module cards, and command results expose a visible focus ring.

## Visual QA

- [ ] Review `.tmp-erp-homepage/erp-home-desktop.png`.
- [ ] Review `.tmp-erp-homepage/erp-home-mobile.png`.
- [ ] Review `.tmp-admin-activity-logs/admin-activity-access-state-desktop.png`.
- [ ] Review `.tmp-admin-activity-logs/admin-activity-access-state-mobile.png`.
- [ ] Review `.tmp-admin-activity-logs/admin-activity-authenticated-desktop.png` and `.tmp-admin-activity-logs/admin-activity-authenticated-mobile.png`.
- [ ] Review `.tmp-admin-storage/admin-storage-access-state-desktop.png` and `.tmp-admin-storage/admin-storage-access-state-mobile.png`.
- [ ] Review `.tmp-admin-storage/admin-storage-authenticated-desktop.png` and `.tmp-admin-storage/admin-storage-authenticated-mobile.png`.
- [ ] Review `.tmp-admin-users/admin-users-access-state-desktop.png` and `.tmp-admin-users/admin-users-access-state-mobile.png`.
- [ ] Review `.tmp-admin-users/admin-users-authenticated-desktop.png` and `.tmp-admin-users/admin-users-authenticated-mobile.png`.
- [ ] Review `.tmp-admin-photos/admin-photos-album-desktop.png` and `.tmp-admin-photos/admin-photos-album-mobile.png`.
- [ ] Review `.tmp-admin-photos/admin-photos-converter-desktop.png` and `.tmp-admin-photos/admin-photos-converter-mobile.png`.
- [ ] Review `.tmp-corp-pages/*-desktop.png` and `.tmp-corp-pages/*-mobile.png`.
- [ ] Review `.tmp-corp-pages/staff-intro-drawer-desktop.png` and `.tmp-corp-pages/staff-intro-drawer-mobile.png`.
- [ ] Confirm `.tmp-corp-pages/business-area-mobile.png` shows the `Business Cards` section hint in the first viewport.
- [ ] Confirm `.tmp-corp-pages/project-board-mobile.png` shows all visible category filters without clipped horizontal chips.
- [ ] Confirm mobile hero title and action buttons do not wrap awkwardly at 390px width.
- [ ] Confirm Admin, Corporate, Personal Workflow, and AI Operations filters remain readable.
- [ ] Confirm the activity-log comfortable/compact density modes keep rows readable on desktop and mobile.

## Known Follow-Ups

- [ ] Recheck corporate content pages if first-load route-specific payload becomes the next release focus; current pages are covered by `verify:corp-pages`.
- [ ] Recheck admin photo tooling before adding more DnD, AI image, or media conversion dependencies; current create/edit, AI import, and bulk upload modals are lazy loaded.
