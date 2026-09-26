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
#   TARGET_BRANCH  the branch to carry to (default develop)
# The source is HEAD and the remote is origin. The commit identity comes from
# GIT_AUTHOR_* / GIT_COMMITTER_* or git config.

set -euo pipefail

SOURCE_BRANCH="${SOURCE_BRANCH:?SOURCE_BRANCH is required}"
TARGET_BRANCH="${TARGET_BRANCH:-develop}"

INPUTS=(README.template.md index.js)
OUTPUTS=(README.md assets/github-stats-light.svg assets/github-stats-dark.svg)

# Operate on the repository the working directory belongs to, whatever the
# caller exported (a git hook, for one, sets GIT_DIR / GIT_INDEX_FILE), then run
# from its top level, since the paths below are repository-relative.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_PREFIX
cd "$(git rev-parse --show-toplevel)"

# notice MESSAGE
#   Print MESSAGE as an Actions notice when running in GitHub Actions, and as a
#   plain "notice:" line anywhere else.
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

source_sha="$(git rev-parse --verify "HEAD^{commit}")"

# The workflow's checkout is shallow; one commit of the target is all this needs.
git fetch --quiet --no-tags --depth=1 origin \
  "+refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
target_sha="$(git rev-parse --verify "refs/remotes/origin/${TARGET_BRANCH}^{commit}")"

# Guard: the generator's inputs must be the same blobs on both commits.
# blob COMMIT PATH
#   Print the blob id of PATH in COMMIT, or "(missing)" when COMMIT has no such
#   path, so a path missing on one side never compares equal to a blob.
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

# Build the target's tree with only the outputs replaced, in a scratch index.
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT
export GIT_INDEX_FILE="${scratch_dir}/index"
git read-tree "$target_sha"
for path in "${OUTPUTS[@]}"; do
  entry="$(git ls-tree "$source_sha" -- "$path")"
  if [ -z "$entry" ]; then
    echo "error: ${path} is missing from ${source_sha:0:8}; the generator should always write it" >&2
    exit 1
  fi
  read -r mode _type object _path <<<"$entry"
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
  -m "From ${source_sha:0:8} on ${SOURCE_BRANCH}. Only ${OUTPUTS[*]}; ${INPUTS[*]} are identical on both branches.")"

# Not a force push: if the target moved since the fetch, this is rejected and the job fails visibly.
git push --quiet origin "${new_commit}:refs/heads/${TARGET_BRANCH}"
notice "carried ${OUTPUTS[*]} from ${SOURCE_BRANCH} (${source_sha:0:8}) to ${TARGET_BRANCH} as ${new_commit:0:8}."
