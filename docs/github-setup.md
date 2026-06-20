# GitHub Operations Setup

This repository is set up for five operating workflows:

1. CI checks on pull requests and pushes to `main`.
2. GitHub Secrets for Firebase and build-time configuration.
3. Firebase deployment from `main`.
4. `main` branch protection.
5. Issues and Projects for work tracking.

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

Optional:

- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `NEXT_PUBLIC_FIREBASE_DATABASE_ID`
- `NEXT_PUBLIC_SENTRY_DSN`
- `GEMINI_API_KEY`
- `GROK_API_KEY`
- `GEMINI_ADMIN_UIDS`

Repository variables:

- `FIREBASE_PROJECT_ID`: defaults to `propig-63524`.
- `GEMINI_MODEL`: defaults to `gemini-2.5-flash`.
- `GEMINI_IMAGE_MODEL`: defaults to `gemini-2.5-flash-image`.

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
gh secret set GEMINI_API_KEY --repo playzzin/propig
gh secret set GROK_API_KEY --repo playzzin/propig
gh secret set GEMINI_ADMIN_UIDS --repo playzzin/propig
```

The deploy workflow writes these runtime values to a temporary `functions/.env`
file inside the GitHub Actions runner before deploying Firebase Functions.

Set variables:

```powershell
gh variable set FIREBASE_PROJECT_ID --repo playzzin/propig --body "propig-63524"
gh variable set GEMINI_MODEL --repo playzzin/propig --body "gemini-2.5-flash"
gh variable set GEMINI_IMAGE_MODEL --repo playzzin/propig --body "gemini-2.5-flash-image"
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
