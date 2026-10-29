# Habit Tracker Refactor Plan

`src/components/habits/HabitTrackerApp.tsx` is the largest client component in the project. It combines data modeling, Firestore synchronization, statistics, export helpers, styled-components, and every view renderer in one file, which makes routine changes expensive to review and verify.

## Current Risk Areas

- Component size: about 9,200 lines.
- Mixed responsibilities: persistence, state transitions, scoring helpers, chart preparation, forms, manual content, and layout styles share one module.
- Regression surface: small UI changes can accidentally affect Firestore persistence or scoring logic.
- Review cost: unrelated edits appear in one large diff, making ownership unclear.

## Extraction Order

1. Move small client-only state hooks out of the page component.
2. Move Firestore workspace subscription and persistence into `useHabitWorkspace`.
3. Move daily record handlers into `useHabitDailyRecords`.
4. Move management form draft logic into `useHabitManagement`.
5. Move manual guide content and repeated manual card sections into dedicated data/components.
6. Move styled-components into feature-scoped style files only after behavior is covered.

## First Extraction

`useDailyRecordLayout` now owns the localStorage-backed daily record layout preference. This is intentionally narrow: it reduces component responsibility without changing rendering behavior or persistence data shape.

## Verification

After each extraction, run:

- `npm run lint -- --max-warnings=0`
- `npm run type-check`
- `npm test`
- `npm run build` for changes touching render paths or static export behavior.
