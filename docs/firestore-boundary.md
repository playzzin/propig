# Firestore Boundary

This document tracks the Firestore rules and indexes that are currently required by production client queries.

## Owner/Admin Collections

These top-level collections use `userId` or owner fields and should stay limited to the document owner or an admin:

- `ai_generations`
- `bookmarks`
- `categories`
- `driveItems`
- `video_studio_projects`
- `video_studio_clips`
- `video_studio_jobs`

`ai_generations` reads are intentionally owner/admin only. The image gallery and import modal already query with `where('userId', '==', currentUser.uid)`.

## Required Composite Indexes

| Collection | Query shape | Index |
| --- | --- | --- |
| `ai_generations` | `where userId == uid` + `orderBy createdAt desc` | `userId ASC`, `createdAt DESC` |

`npm run verify:firestore-boundary` fails if this index or the `ai_generations` owner/admin read rule is removed.
