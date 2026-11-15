# GitHub Operations Setup

This repository is set up for five operating workflows:

1. CI checks on pull requests and pushes to every branch, using GitHub-hosted Ubuntu runners and Node 22.
2. GitHub Secrets for Firebase and build-time configuration.
3. Firebase Hosting previews from working branches, and production deployment from `main`.
4. `main` branch protection.
5. Issues and Projects for work tracking.

## Develop while GitHub verifies and deploys

Commit and push from either PC or Codex Cloud. GitHub checks out that commit in
its own workspace, so local edits can continue immediately and both PCs can be
turned off after the push completes. No self-hosted runner installation is needed.

- Every branch push and pull request runs lint, type checks, tests, release/security
  contracts, a static web build, browser checks against that build, and a Functions build.
- A successful push to a working branch deploys its verified hosting artifact to a
  branch-specific Firebase preview channel. The `Firebase Hosting preview` job waits
  for both `Web app` and `Firebase Functions`; a failure blocks the preview.
- Preview deployment runs only on pushes inside `playzzin/propig`, never on PR events
  or Dependabot branches. The public URL is saved in the `preview-link-<commit>`
  artifact and written to the Actions summary and `preview` environment. GitHub can
  mask the latter when public Firebase identifiers are stored as secrets; the link
  artifact contains only the public URL, never credentials. The preview expires after
  seven days and is refreshed by the next successful push.
- Preview channels deploy Hosting only. They share the existing Firebase project's
  authentication, data and backend services; they are not an isolated test database.
  New Functions, rules and indexes are deployed only through the production workflow.
- `main` pushes run the production workflow, which repeats all release gates before
  deploying Hosting, Functions, rules and indexes. Manual production runs are also
  restricted to `main`. A failed gate stops deployment.
- Browser installation uses the repository's locked `playwright-core` CLI so the
  installed Chromium version matches the test library. Both workflows test the built
  static files rather than a development server.

These workflows apply to branches containing this configuration. Bring this change
into older working branches before expecting their pushes to use the new pipeline.
Keep the `Web app` and `Firebase Functions` required checks when protecting `main`.

The repository `FIREBASE_SERVICE_ACCOUNT` secret can be reused for previews. If it
is restricted to the `production` environment, configure a Hosting deployment
credential in the `preview` environment. Missing credentials fail visibly; never
paste credentials into workflow files or commit them.
Public Firebase build settings must be repository secrets so the web job can use
them before uploading its artifact. Preview-targeted pushes fail before building
if a required setting is missing or the build and deployment project IDs differ.

## Required GitHub Secrets

Set these in GitHub: `Settings -> Secrets and variables -> Actions -> Repository secrets`.

Required for deploy:

- `FIREBASE_SERVICE_ACCOUNT`: full Firebase service account JSON.
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `OPENROUTER_API_KEY` (production Functions deployment)

Optional:

- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `NEXT_PUBLIC_FIREBASE_DATABASE_ID`
- `NEXT_PUBLIC_SENTRY_DSN`
- `ADMIN_UIDS`

Repository variables:

- `FIREBASE_PROJECT_ID`: defaults to `propig-63524`.
- `OPENROUTER_MODEL`: defaults to `openai/gpt-4.1-mini`.
- `OPENROUTER_IMAGE_MODEL`: defaults to `openai/gpt-image-1`.
- `OPENROUTER_VIDEO_MODEL`: defaults to `openai/sora-2`.
- `OPENROUTER_FALLBACK_MODELS`: optional.

## Setting Secrets With GitHub CLI

Install the GitHub CLI on Windows:

```powershell
winget install --id GitHub.cli
gh auth login
```

Then set secrets:

```powershell
gh secret set FIREBASE_SERVICE_ACCOUNT --repo playzzin/propig < firebase-service-account.json
gh secret set NEXT_PUBLIC_FIREBASE_API_KEY --repo playzzin/propig
gh secret set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --repo playzzin/propig
gh secret set NEXT_PUBLIC_FIREBASE_PROJECT_ID --repo playzzin/propig
gh secret set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET --repo playzzin/propig
gh secret set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --repo playzzin/propig
gh secret set NEXT_PUBLIC_FIREBASE_APP_ID --repo playzzin/propig
gh secret set OPENROUTER_API_KEY --repo playzzin/propig
gh secret set ADMIN_UIDS --repo playzzin/propig
```

The deploy workflow writes these runtime values to a temporary `functions/.env`
file inside the GitHub Actions runner before deploying Firebase Functions.

Set variables:

```powershell
gh variable set FIREBASE_PROJECT_ID --repo playzzin/propig --body "propig-63524"
gh variable set OPENROUTER_MODEL --repo playzzin/propig --body "openai/gpt-4.1-mini"
gh variable set OPENROUTER_IMAGE_MODEL --repo playzzin/propig --body "openai/gpt-image-1"
gh variable set OPENROUTER_VIDEO_MODEL --repo playzzin/propig --body "openai/sora-2"
```

## Branch Protection

After the first CI run appears in GitHub, enable branch protection for `main`.

Recommended settings:

- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Required checks: `Web app`, `Firebase Functions`.
- Block force pushes.
- Block branch deletion.

If you have a GitHub token with repository administration permission:

```powershell
$env:GITHUB_TOKEN = "paste-token-here"
pwsh .github/scripts/configure-main-protection.ps1
```

## Issues and Project Board

Use the included issue templates for bugs and features.

Suggested GitHub Project columns:

- Backlog
- Ready
- In Progress
- Review
- Done

Suggested starter issues:

- Configure GitHub Actions secrets for Firebase deploy.
- Enable `main` branch protection after the first CI run.
- Verify Firebase deployment from GitHub Actions.
- Add release tags for stable deployments.
