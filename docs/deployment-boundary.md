# Deployment Boundary

ProPig deploys the web application as a Firebase Hosting static export. Browser-visible API requests therefore need a Firebase Functions runtime.

## Static export behavior

- `npm run build` runs `scripts/build-static-export.mjs`.
- Next API route files are temporarily renamed with `.static-export-disabled` while the static export is generated, then restored.
- Firebase Hosting serves `.next-static-export`.
- `scripts/verify-deployment-boundary.mjs --require-static-export-runtime` fails the build when a browser `/api/*` call has no classified runtime.

The Next route files under `src/app/api` remain the local-development contract and comparison implementation. Production requests are served by Firebase Functions.

## Hosting rewrites

Exact rewrites are declared before the gateway so their existing Functions keep priority:

| Source | Function |
| --- | --- |
| `/api/analyze-bookmark` | `analyzeBookmark` |
| `/api/admin/check` | `adminCheck` |
| `/api/admin/storage` | `adminStorage` |
| `/api/openrouter-usage` | `openRouterUsage` |
| `/api/**` | `hostingApi` |

`hostingApi` is an explicit allow-list router in `functions/src/api/hostingApi.ts`. Unknown API paths return 404. The wildcard rewrite must remain last.

The gateway currently serves:

- authenticated activity logging and administrator activity-log browsing;
- administrator user, menu, and OpenRouter model settings;
- authenticated ERP home preferences;
- SSRF-safe authenticated image fetching;
- rate-limited Sharp image conversion;
- OpenRouter image, storyboard, project-board HTML, and video generation;
- owned Video Studio status, clip, job, processing, and timeline operations.

## Security boundary

- Browser requests use Firebase ID tokens.
- Administrator routes require an administrator account or their specific delegated permission.
- OpenRouter credentials are read only from Firebase Secret `OPENROUTER_API_KEY`.
- The settings API can change model identifiers and managed pages, but cannot write runtime secrets.
- External image requests reject localhost, private networks, embedded credentials, unsupported protocols, oversized responses, and unsafe redirects.
- Image and generation routes enforce size and per-user rate limits.
- Video Studio mutations verify project, clip, and job ownership.
- The development agent test API is not exposed in production; its pages render a development-only notice.

## Runtime manifest and release gate

`docs/api-runtime-boundary.json` classifies every `src/app/api/**/route.ts` contract. For gateway routes it records `firebase-hosting-rewrite` with function `hostingApi`.

The verifier checks:

1. every Next API route is classified;
2. exact rewrites point to exported Functions and matching route contracts;
3. the `/api/**` rewrite points to `hostingApi` and is last;
4. every gateway route in the manifest appears in `HOSTING_API_ROUTE_PATTERNS`;
5. every gateway registry entry has a matching manifest route;
6. every browser `/api/*` call resolves to an active production runtime.

Required release checks:

```text
npm run verify:deployment-boundary
npm run type-check
npm run lint
npm test
npm --prefix functions run build
npm run build
```

Deployment must include both Functions and Hosting so the static client and API runtime change together.
