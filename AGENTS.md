# Guslar agent instructions

## Checks

- `npm run check` typechecks, lints, builds and runs the tests. It must pass before any commit.

## Verify

- The feature map in `docs/manual/` says what Guslar does and what you should see.
- A change the map describes is not done until a run of the verify skill (`.agents/skills/verify/`) produced an `evidence.md` with no failed check.
- When a change alters behaviour the map describes, or adds behaviour, the map changes in the same PR.
