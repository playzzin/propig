# Video Studio Worker Deployment

This guide covers the queue worker behind `/admin/video-studio`.

## What changed

- Video renders are queued in Firestore under `video_studio_jobs`.
- Firebase Functions picks up queued jobs automatically through Firestore triggers.
- The worker generates Grok videos, extracts last frames, merges clips, and writes outputs back to Firebase Storage.
- Normal processing no longer depends on a browser tab staying open.

## Required runtime pieces

1. Root app deployment for the admin UI and API routes.
2. Firebase Functions deployment for the queue worker.
3. Firestore rules deployment for:
   - `video_studio_projects`
   - `video_studio_clips`
   - `video_studio_jobs`
4. Firebase Storage bucket configured for the project.
5. `GROK_API_KEY` available to the Functions runtime.

## Required configuration

### Root app environment

Set these in the Next.js environment used by the app:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

`FIREBASE_STORAGE_BUCKET` is recommended so both the app and the worker resolve the same bucket explicitly.

### Functions secret

Set the Grok key as a Firebase Functions secret:

```bash
firebase functions:secrets:set GROK_API_KEY
```

The worker reads `process.env.GROK_API_KEY` inside [functions/src/videoStudio/xai.ts](/C:/Users/playz/propig/functions/src/videoStudio/xai.ts).

### Optional manual fallback

These are only needed if you want to call the internal processor route manually:

```env
APP_BASE_URL=https://your-app.example.com
VIDEO_STUDIO_PROCESSOR_SECRET=replace-with-a-long-random-secret
```

Normal queued processing does not depend on this bridge anymore because the Firestore trigger runs the worker directly.

## One-time setup

1. Install root dependencies.
   ```bash
   npm install
   ```
2. Install Functions dependencies.
   ```bash
   cd functions
   npm install
   ```
3. Select the target Firebase project.
   ```bash
   firebase use <project-id>
   ```
4. Store the Grok secret.
   ```bash
   firebase functions:secrets:set GROK_API_KEY
   ```

## Deploy order

1. Deploy Firestore rules first.
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Deploy Functions.
   ```bash
   firebase deploy --only functions
   ```
3. Deploy the Next.js app with the matching environment variables.

If you deploy the app before Functions, the UI can still queue jobs, but they will remain in `queued` status until the worker trigger is live.

## Verification

1. Open `/admin/video-studio`.
2. Create a project and submit a short generate job.
3. Confirm the job transitions through:
   - `queued`
   - `running`
   - `completed` or `failed`
4. Confirm a clip document is created in `video_studio_clips`.
5. Confirm the clip has `videoUrl` and, after extraction, `lastFrameUrl`.
6. Submit a merge job and confirm the merged clip is stored in the same project.

## Logs and debugging

- Functions logs:
  ```bash
  firebase functions:log --only onVideoStudioJobQueued
  firebase functions:log --only onVideoStudioJobRequeued
  ```
- Local type checks:
  ```bash
  npx tsc --noEmit --pretty false
  cd functions && npx tsc --project tsconfig.json --pretty false
  ```

## Common failures

### `Grok API key is missing`

The Functions secret is missing or was not redeployed after setting it.

### Jobs stay in `queued`

- Functions were not deployed.
- Firestore trigger logs show an exception.
- The Firebase project selected in CLI does not match the project used by the app.

### Storage upload fails

- The Storage bucket is not enabled.
- `FIREBASE_STORAGE_BUCKET` or `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` points to the wrong bucket.
- The deployed service account does not have Storage write access.

### Local warning about Node version

`functions/package.json` targets Node `20`. Local installs on Node `22` can warn, but Firebase deploy should still target the configured runtime. Match Node 20 locally if you want warning-free installs.
