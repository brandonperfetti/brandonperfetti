# Repository instructions

Read the agent working agreements first (`agent-working-agreements/AGENT-WORKING-AGREEMENTS.md`,
Parts A and B, plus your client file). This file adds only what is specific to this repository; it
never overrides Parts A–B, and a rule here that contradicts one there is the rule that is wrong. A
rule earns a line here only when something bit.

## What this repository is

Brandon's GitHub profile README. The profile page serves `master`. Feature work branches off
`develop` and reaches `master` only through the `develop → master` release PR, which Brandon opens
and merges.

## Generated files

- `README.template.md` is the source. `README.md` is generated. **Never hand-edit `README.md`.**
  Edit the template, regenerate, commit both. (A hand-edited `README.md` once drifted 480 lines from
  its template; running the generator would have silently reverted it.)
- The generator writes exactly three paths: `README.md`, `assets/github-stats-light.svg` and
  `assets/github-stats-dark.svg`. Nothing else is ever committed by the workflow
  (`.github/workflows/readme.yml`).
- Regenerate with `GITHUB_TOKEN="$(gh auth token)" node index.js`. The committed files are the
  generator's output; a change to the template ships with the regenerated files in the same commit.

## Gate

`node --check index.js` · `node --test` · the regeneration above, with a clean tree afterwards. CI
runs the first two on every pull request (`.github/workflows/test.yml`).

## Badges

Use only the logos Shields still serves: `logo=<simple-icons slug>`, and check the rendered SVG
contains an `<image>` element before shipping it. GitHub, Vercel and X are in Simple Icons because
those brands permit it. **Never re-add a logo that was pulled, and never embed a pulled glyph as a
data URI.** LinkedIn was removed in Simple Icons 14.0.0 because LinkedIn's brand policy forbids
third-party use of its marks
([simple-icons/simple-icons#11372](https://github.com/simple-icons/simple-icons/issues/11372)).
The LinkedIn badges in the README carry no logo on purpose.

## Known traps

- `RAW_BASE_URL` in `index.js` hardcodes `master`. Renaming the default branch breaks the stats
  card silently: the URLs 404 and no test fails.
- The stats-card URLs are absolute against `raw/master`, so the card is blank on `develop` and on
  branches until a release lands the SVGs on `master`. Transient, not a defect.

## Branch protection

Protection for `master` on this repository is decided in
[brandonperfetti/brandonperfetti#4](https://github.com/brandonperfetti/brandonperfetti/issues/4):
the README workflow pushes to `master` daily, which the working agreements' release profile would
block. Nothing here pre-empts that decision; read the issue before applying any profile.

## Commits

No attribution trailers on any commit or PR body (RULE ZERO). The workflow's own commit is authored
as Brandon through the account's noreply address, message `chore: regenerate README`, nothing
appended.
