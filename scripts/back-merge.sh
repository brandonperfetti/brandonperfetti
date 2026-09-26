#!/usr/bin/env bash
# Carry the generator's output from the commit this job produced onto develop.
#
# Runs in the README workflow after the generated files are committed to the
# branch the job ran on (normally master). It moves exactly the three derived
# paths, and only when the generator's inputs are byte-identical on both
# branches:
#
#   inputs   README.template.md, index.js
#   outputs  README.md, assets/github-stats-light.svg, assets/github-stats-dark.svg
#
# If an input differs, develop has in-flight template or generator work and
# its own regenerated output must not be overwritten; the script logs why and
# exits 0. It never merges branches, never force-pushes, and pushes to no ref
# but the target branch. The commit is built without touching the working tree
# or HEAD, so nothing the job checked out is disturbed.
#
# Environment:
#   SOURCE_BRANCH  the branch the job ran on (github.ref_name); required
#   SOURCE_REF     the commit to carry from (default HEAD)
#   TARGET_BRANCH  the branch to carry to (default develop)
#   REMOTE         the remote to fetch from and push to (default origin)
# The commit identity comes from GIT_AUTHOR_* / GIT_COMMITTER_* or git config.

set -euo pipefail

SOURCE_BRANCH="${SOURCE_BRANCH:?SOURCE_BRANCH is required}"
SOURCE_REF="${SOURCE_REF:-HEAD}"
TARGET_BRANCH="${TARGET_BRANCH:-develop}"
REMOTE="${REMOTE:-origin}"

INPUTS=(README.template.md index.js)
OUTPUTS=(README.md assets/github-stats-light.svg assets/github-stats-dark.svg)

# A notice in the Actions log, a plain line anywhere else.
notice() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::notice title=Back-merge to ${TARGET_BRANCH}::$1"
  else
    echo "notice: $1"
  fi
}

if [ "$SOURCE_BRANCH" = "$TARGET_BRANCH" ]; then
  notice "skipped: the job ran on ${TARGET_BRANCH} itself, so there is nothing to carry."
  exit 0
fi

source_sha="$(git rev-parse --verify "${SOURCE_REF}^{commit}")"

# The workflow's checkout is shallow; one commit of the target is all this needs.
git fetch --quiet --no-tags --depth=1 "$REMOTE" \
  "+refs/heads/${TARGET_BRANCH}:refs/remotes/${REMOTE}/${TARGET_BRANCH}"
target_sha="$(git rev-parse --verify "refs/remotes/${REMOTE}/${TARGET_BRANCH}^{commit}")"

# Guard: the generator's inputs must be the same blobs on both commits.
blob() { git rev-parse --quiet --verify "$1:$2" || echo "(missing)"; }
differing=()
for path in "${INPUTS[@]}"; do
  if [ "$(blob "$source_sha" "$path")" != "$(blob "$target_sha" "$path")" ]; then
    differing+=("$path")
  fi
done
if [ "${#differing[@]}" -gt 0 ]; then
  notice "skipped: ${differing[*]} differ between ${SOURCE_BRANCH} (${source_sha:0:8}) and ${TARGET_BRANCH} (${target_sha:0:8}); ${TARGET_BRANCH} keeps its own generated output until the inputs match."
  exit 0
fi

# Build the target's tree with only the three outputs replaced, in a scratch index.
scratch_index="$(mktemp)"
trap 'rm -f "$scratch_index"' EXIT
export GIT_INDEX_FILE="$scratch_index"
git read-tree "$target_sha"
for path in "${OUTPUTS[@]}"; do
  entry="$(git ls-tree "$source_sha" -- "$path")"
  if [ -z "$entry" ]; then
    echo "error: ${path} is missing from ${source_sha:0:8}; the generator should always write it" >&2
    exit 1
  fi
  mode="${entry%% *}"
  object="$(echo "$entry" | awk '{print $3}')"
  git update-index --add --cacheinfo "${mode},${object},${path}"
done
new_tree="$(git write-tree)"
unset GIT_INDEX_FILE

if [ "$new_tree" = "$(git rev-parse "${target_sha}^{tree}")" ]; then
  notice "no change: ${TARGET_BRANCH} already carries the output of ${SOURCE_BRANCH} (${source_sha:0:8})."
  exit 0
fi

new_commit="$(git commit-tree "$new_tree" -p "$target_sha" \
  -m "chore: carry the regenerated README to ${TARGET_BRANCH}" \
  -m "From ${source_sha:0:8} on ${SOURCE_BRANCH}. Only README.md and the two stats SVGs; README.template.md and index.js are identical on both branches.")"

# Not a force push: if the target moved since the fetch, this is rejected and the job fails visibly.
git push --quiet "$REMOTE" "${new_commit}:refs/heads/${TARGET_BRANCH}"
notice "carried ${OUTPUTS[*]} from ${SOURCE_BRANCH} (${source_sha:0:8}) to ${TARGET_BRANCH} as ${new_commit:0:8}."
