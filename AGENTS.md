# Repository instructions

Read the agent working agreements first: Parts A and B of
[`AGENT-WORKING-AGREEMENTS.md`](https://github.com/brandonperfetti/agent-working-agreements/blob/master/AGENT-WORKING-AGREEMENTS.md)
(on this machine, `~/dev/sansfaux/agent-working-agreements/`), plus your client file. This file adds
only what is specific to this repository; it never overrides Parts A–B, and a rule here that
contradicts one there is the rule that is wrong. A rule earns a line here only when something bit.

## What this repository is

Brandon's GitHub profile README. The profile page serves `master`.

## Generated files

- `README.template.md` is the source. `README.md` is generated. **Never hand-edit `README.md`.**
  Edit the template, regenerate, commit both. (A hand-edited `README.md` once sat 480 diff lines
  from its template; running the generator would have silently reverted it.)
- The generator writes exactly three paths: `README.md`, `assets/github-stats-light.svg` and
  `assets/github-stats-dark.svg`. Nothing else is ever committed by the workflow
  (`.github/workflows/readme.yml`). It commits those paths to the branch it ran on, then
  `scripts/back-merge.sh` carries the same three paths onto `develop`, but only when
  `README.template.md` and `index.js` are byte-identical on both branches; otherwise it skips and
  logs why, so in-flight template or generator work on `develop` is never overwritten with output
  from the old inputs. It never merges branches or force-pushes. Both commits are authored as
  Brandon through the account's noreply address, nothing appended.
- Regenerate with `GITHUB_TOKEN="$(gh auth token)" node index.js`. The committed files are the
  generator's output; a change to the template ships with the regenerated files in the same commit.

## Gate

`node --check index.js` · `node --test` · regenerate, then confirm that regenerating changed nothing
outside the three generated paths. A template edit ships with its regenerated output in the same
commit. CI runs the first two on every pull request (`.github/workflows/test.yml`).

## Badges

Use only the logos Shields still serves: `logo=<simple-icons slug>`, and check the rendered SVG
contains an `<image>` element before shipping it. GitHub, Vercel and X are in Simple Icons because
those brands permit it. **Never re-add a logo that was pulled, and never embed a pulled glyph as a
data URI.** LinkedIn was removed in Simple Icons 14.0.0 because LinkedIn's brand policy forbids
third-party use of its marks
([simple-icons/simple-icons#11372](https://github.com/simple-icons/simple-icons/issues/11372)).
The LinkedIn badges in the README carry no logo on purpose.

## Known trap

`RAW_BASE_URL` in `index.js` hardcodes `master`, so the stats-card URLs always point at `master`'s
SVGs: branch and `develop` views show `master`'s card, not the branch's regenerated one, and
renaming the default branch breaks the card silently (the URLs 404 and no test fails).

## Branch protection

Protection for `master` on this repository is decided in
[brandonperfetti/brandonperfetti#4](https://github.com/brandonperfetti/brandonperfetti/issues/4):
the README workflow commits regenerated files to `master` on a daily schedule, which the working
agreements' release profile would block. Nothing here pre-empts that decision; read the issue
before applying any profile.
