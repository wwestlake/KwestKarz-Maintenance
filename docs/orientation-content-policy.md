# Orientation Content Policy

The employee orientation system keeps its lesson material in source control so training stays aligned with product changes.

## Requirements

- Lesson text, quiz prompts, resource links, and checklists live in `src/react/src/content/orientationLessons.ts`.
- Lesson content changes are versioned through `orientationLessonSetVersion`.
- The orientation UI loads against that version and resets saved progress when the lesson set version changes.
- Any branch that changes workflow behavior should update the matching orientation lesson in the same branch whenever training text or steps change.
- If a behavior change does not affect onboarding content, the PR should state that explicitly.
- New lessons should include a source issue or feature reference in the PR body or commit message.

## Update Rule

When product behavior changes, update the orientation content at the same time:

1. Edit the relevant lesson content in `orientationLessons.ts`.
2. Bump `orientationLessonSetVersion` when the lesson set shape or wording meaningfully changes.
3. Run the frontend build.
4. Merge the code and content together so the docs and training do not drift apart.

## Practical Notes

- Keep the lesson file readable and reviewable.
- Prefer small, focused lesson edits instead of rewriting the full set for every change.
- If a lesson needs a new resource or gate, update the lesson file in the same commit as the app behavior.
