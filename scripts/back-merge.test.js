"use strict";

// Exercises scripts/back-merge.sh against real git repositories: a bare
// "remote", a full clone to arrange branch states, and a shallow single-branch
// clone standing in for the workflow's depth-1 checkout (actions/checkout
// fetches one commit rather than cloning, which makes no difference here: the
// script fetches the target by an explicit refspec and reads the source at HEAD).

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "back-merge.sh");
const BOT = { name: "Brandon Perfetti", email: "2780463+brandonperfetti@users.noreply.github.com" };
const HUMAN = { name: "Fixture Author", email: "fixture@example.com" };

/**
 * Environment for a git command in the fixtures: the host's git configuration
 * (signing, hooks, default branch) and any repository-pointing variables a
 * caller exported (git sets GIT_INDEX_FILE for hooks, for one) are dropped, so
 * fixtures never read host config or write into another repository.
 * @param {{name: string, email: string}} identity author and committer
 * @returns {NodeJS.ProcessEnv}
 */
function gitEnv(identity) {
  const inherited = { ...process.env };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR"]) {
    delete inherited[name];
  }
  return {
    ...inherited,
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
    GITHUB_ACTIONS: "",
  };
}

/**
 * Run git in `cwd` with the fixture environment and return trimmed stdout.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{name: string, email: string}} [identity]
 * @returns {string}
 */
function git(cwd, args, identity = HUMAN) {
  return execFileSync("git", args, { cwd, env: gitEnv(identity), encoding: "utf8" }).trim();
}

/**
 * Write `content` to `file` under `dir`, creating parent directories.
 * @param {string} dir
 * @param {string} file repository-relative path
 * @param {string} content
 */
function write(dir, file, content) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
}

const BASE = {
  "README.template.md": "# Hi\n{github_stats}\n",
  "index.js": "// generator v1\n",
  "README.md": "# Hi\n<card 100>\n",
  "assets/github-stats-light.svg": "<svg>100 light</svg>\n",
  "assets/github-stats-dark.svg": "<svg>100 dark</svg>\n",
  "assets/header-banner.png": "banner\n",
};

/**
 * A bare remote with master and develop at the same initial commit, plus
 * helpers to advance either branch, clone a runner, run the script and read
 * the remote. Removed when the test ends.
 * @param {import("node:test").TestContext} t
 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "back-merge-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  git(root, ["init", "--quiet", "--bare", "-b", "master", remote]);
  git(root, ["clone", "--quiet", remote, work]);
  for (const [file, content] of Object.entries(BASE)) write(work, file, content);
  git(work, ["add", "-A"]);
  git(work, ["commit", "--quiet", "-m", "initial"]);
  git(work, ["push", "--quiet", "origin", "HEAD:master"]);
  git(work, ["push", "--quiet", "origin", "HEAD:develop"]);

  /**
   * Commit `files` (a null content skips the write) and remove `remove` on
   * `branch`, then push it. Returns the new commit id.
   */
  function commitOn(branch, files, message, identity = HUMAN, remove = []) {
    git(work, ["fetch", "--quiet", "origin"]);
    git(work, ["checkout", "--quiet", "-B", branch, `origin/${branch}`]);
    for (const [file, content] of Object.entries(files)) if (content !== null) write(work, file, content);
    for (const file of remove) git(work, ["rm", "--quiet", file]);
    git(work, ["add", "-A"]);
    git(work, ["commit", "--quiet", "-m", message], identity);
    git(work, ["push", "--quiet", "origin", `HEAD:${branch}`]);
    return git(work, ["rev-parse", "HEAD"]);
  }

  /** The workflow's checkout, as near as a test gets: one commit of one branch, over a URL. */
  function runner(branch = "master") {
    const dir = path.join(root, `runner-${branch}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    git(root, ["clone", "--quiet", "--depth", "1", "--branch", branch, `file://${remote}`, dir]);
    return dir;
  }

  /** Run the script in `dir` as the bot; returns its exit status and combined output. */
  function run(dir, sourceBranch = "master", extraEnv = {}) {
    const result = spawnSync("bash", [SCRIPT], {
      cwd: dir,
      env: { ...gitEnv(BOT), SOURCE_BRANCH: sourceBranch, ...extraEnv },
      encoding: "utf8",
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  }

  /** Every ref on the remote with its object id, one per line. */
  const refs = () => git(root, ["--git-dir", remote, "for-each-ref", "--format=%(refname) %(objectname)"]);
  /** The commit a branch points at on the remote. */
  const tip = (branch) => git(root, ["--git-dir", remote, "rev-parse", branch]);
  /** A file's content on a branch of the remote. */
  const show = (branch, file) => git(root, ["--git-dir", remote, "show", `${branch}:${file}`]);

  return { commitOn, runner, run, refs, tip, show, remote, root };
}

const REGENERATED = {
  "README.md": "# Hi\n<card 105>\n",
  "assets/github-stats-light.svg": "<svg>105 light</svg>\n",
  "assets/github-stats-dark.svg": "<svg>105 dark</svg>\n",
};
const OUTPUTS = Object.keys(REGENERATED);

test("identical inputs: carries exactly the three outputs onto develop as one commit", (t) => {
  const f = fixture(t);
  f.commitOn("develop", { "NOTES.md": "develop-only work\n" }, "develop: unrelated work");
  f.commitOn("master", { "MASTER_ONLY.md": "master-only history\n" }, "master: unrelated history");
  const masterTip = f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const developBefore = f.tip("develop");

  const { status, out } = f.run(f.runner("master"));

  assert.equal(status, 0, out);
  assert.match(out, /carried README\.md assets\/github-stats-light\.svg assets\/github-stats-dark\.svg/);
  const developAfter = f.tip("develop");
  assert.notEqual(developAfter, developBefore);
  for (const file of OUTPUTS) {
    assert.equal(f.show("develop", file), f.show("master", file), `${file} matches master`);
  }
  // Only the outputs moved: develop keeps its own work and gains no master-only history.
  assert.equal(f.show("develop", "NOTES.md"), "develop-only work");
  assert.throws(() => f.show("develop", "MASTER_ONLY.md"));
  const changed = execFileSync("git", ["--git-dir", f.remote, "diff", "--name-only", developBefore, developAfter], { encoding: "utf8" })
    .trim().split("\n").sort();
  assert.deepEqual(changed, [...OUTPUTS].sort());
  // One commit on top of develop, not a merge; authored and committed as the bot, no trailer.
  const meta = execFileSync("git", ["--git-dir", f.remote, "log", "-1", "--format=%P%n%an <%ae>%n%cn <%ce>%n%B", "develop"], { encoding: "utf8" });
  const [parents, author, committer, ...body] = meta.trim().split("\n");
  assert.equal(parents, developBefore);
  assert.equal(author, `${BOT.name} <${BOT.email}>`);
  assert.equal(committer, `${BOT.name} <${BOT.email}>`);
  assert.equal(body[0], "chore: carry the regenerated README to develop");
  assert.match(body.join("\n"), new RegExp(`From ${masterTip.slice(0, 8)} on master\\. Only README\\.md assets/github-stats-light\\.svg assets/github-stats-dark\\.svg; README\\.template\\.md index\\.js are identical on both branches\\.`));
  assert.doesNotMatch(body.join("\n"), /co-authored-by|claude-session|generated with/i);
  // Pushed to develop and nothing else.
  assert.equal(f.tip("master"), masterTip);
});

test("pushes to no ref other than develop", (t) => {
  const f = fixture(t);
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const before = f.refs().split("\n").filter((line) => !line.startsWith("refs/heads/develop "));

  const { status, out } = f.run(f.runner("master"));

  assert.equal(status, 0, out);
  const after = f.refs().split("\n").filter((line) => !line.startsWith("refs/heads/develop "));
  assert.deepEqual(after, before);
});

test("template differs: skips, says why, exits 0, develop untouched", (t) => {
  const f = fixture(t);
  f.commitOn("develop", { "README.template.md": "# Hi, edited on develop\n{github_stats}\n" }, "develop: template work");
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const developBefore = f.tip("develop");

  const { status, out } = f.run(f.runner("master"));

  assert.equal(status, 0, out);
  assert.match(out, /skipped: README\.template\.md differ between master \([0-9a-f]{8}\) and develop \([0-9a-f]{8}\)/);
  assert.equal(f.tip("develop"), developBefore);
});

test("generator differs: skips, says why, exits 0, develop untouched", (t) => {
  const f = fixture(t);
  f.commitOn("develop", { "index.js": "// generator v2, unreleased\n" }, "develop: generator work");
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const developBefore = f.tip("develop");

  const { status, out } = f.run(f.runner("master"));

  assert.equal(status, 0, out);
  assert.match(out, /skipped: index\.js differ/);
  assert.equal(f.tip("develop"), developBefore);
});

test("output already identical: no commit, exits 0", (t) => {
  const f = fixture(t);
  const developBefore = f.tip("develop");

  const { status, out } = f.run(f.runner("master"));

  assert.equal(status, 0, out);
  assert.match(out, /no change: develop already carries the output of master/);
  assert.equal(f.tip("develop"), developBefore);
});

test("running twice is idempotent", (t) => {
  const f = fixture(t);
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const dir = f.runner("master");

  assert.equal(f.run(dir).status, 0);
  const afterFirst = f.tip("develop");
  const second = f.run(dir);

  assert.equal(second.status, 0, second.out);
  assert.match(second.out, /no change/);
  assert.equal(f.tip("develop"), afterFirst);
});

test("a job that ran on develop itself carries nothing", (t) => {
  const f = fixture(t);
  f.commitOn("develop", REGENERATED, "chore: regenerate README", BOT);
  const developBefore = f.tip("develop");

  const { status, out } = f.run(f.runner("develop"), "develop");

  assert.equal(status, 0, out);
  assert.match(out, /skipped: the job ran on develop itself/);
  assert.equal(f.tip("develop"), developBefore);
});

test("develop moved after the fetch: the push is rejected, not forced", (t) => {
  const f = fixture(t);
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const dir = f.runner("master");
  // Stand in for a concurrent push landing between the script's fetch and its
  // push: a git shim on PATH runs the real fetch, then pushes a commit to
  // develop from another clone, once. A forced push would overwrite it; a
  // plain push must be rejected.
  const realGit = execFileSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const racer = path.join(f.root, "racer");
  execFileSync(realGit, ["clone", "--quiet", f.remote, racer], { env: gitEnv(HUMAN) });
  const bin = path.join(f.root, "bin");
  const marker = path.join(f.root, "raced");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "git"),
    [
      "#!/usr/bin/env bash",
      `"${realGit}" "$@"; status=$?`,
      `if [ "$1" = "fetch" ] && [ ! -e "${marker}" ]; then`,
      `  touch "${marker}"`,
      `  ( unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE; cd "${racer}" && "${realGit}" checkout --quiet -B develop origin/develop && echo race > RACE.md && "${realGit}" add RACE.md && "${realGit}" commit --quiet -m race && "${realGit}" push --quiet origin HEAD:develop ) || exit 99`,
      "fi",
      "exit $status",
      "",
    ].join("\n"),
  );
  fs.chmodSync(path.join(bin, "git"), 0o755);

  const { status, out } = f.run(dir, "master", { PATH: `${bin}${path.delimiter}${process.env.PATH}` });

  assert.ok(fs.existsSync(marker), "the race fired");
  assert.notEqual(status, 0, "the job fails visibly");
  assert.notEqual(status, 99, "the race itself succeeded");
  assert.match(out, /rejected|non-fast-forward|fetch first/);
  assert.equal(f.show("develop", "RACE.md"), "race", "the concurrent commit survives");
});

test("an input present on one side only counts as a mismatch", (t) => {
  const f = fixture(t);
  f.commitOn("develop", { "index.js": null }, "develop: generator moved", HUMAN, ["index.js"]);
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const developBefore = f.tip("develop");

  const { status, out } = f.run(f.runner("master"));

  assert.equal(status, 0, out);
  assert.match(out, /skipped: index\.js differ/);
  assert.equal(f.tip("develop"), developBefore);
});

test("develop missing on the remote: fails loudly, pushes nothing", (t) => {
  const f = fixture(t);
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  execFileSync("git", ["--git-dir", f.remote, "update-ref", "-d", "refs/heads/develop"], { env: gitEnv(HUMAN) });
  const before = f.refs();

  const { status, out } = f.run(f.runner("master"));

  assert.notEqual(status, 0, "the job fails visibly");
  assert.match(out, /couldn't find remote ref/);
  assert.equal(f.refs(), before);
});

test("an output missing from the source: fails loudly, pushes nothing", (t) => {
  const f = fixture(t);
  f.commitOn("master", { "assets/github-stats-dark.svg": null }, "master: output lost", HUMAN, ["assets/github-stats-dark.svg"]);
  const before = f.refs();

  const { status, out } = f.run(f.runner("master"));

  assert.notEqual(status, 0, "the job fails visibly");
  assert.match(out, /assets\/github-stats-dark\.svg is missing from [0-9a-f]{8}/);
  assert.equal(f.refs(), before);
});

test("runs from a subdirectory as it does from the top level", (t) => {
  const f = fixture(t);
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const dir = f.runner("master");

  const { status, out } = f.run(path.join(dir, "assets"));

  assert.equal(status, 0, out);
  assert.match(out, /carried/);
  assert.equal(f.show("develop", "README.md"), f.show("master", "README.md"));
});

test("ignores repository variables the caller exported", (t) => {
  const f = fixture(t);
  f.commitOn("master", REGENERATED, "chore: regenerate README", BOT);
  const dir = f.runner("master");
  // A decoy repository the inherited variables point at; the script must not touch it.
  const decoy = path.join(f.root, "decoy");
  git(f.root, ["init", "--quiet", "-b", "master", decoy]);
  const decoyGit = path.join(decoy, ".git");

  const { status, out } = f.run(dir, "master", {
    GIT_DIR: decoyGit,
    GIT_WORK_TREE: decoy,
    GIT_INDEX_FILE: path.join(decoyGit, "index"),
  });

  assert.equal(status, 0, out);
  assert.match(out, /carried/);
  assert.equal(f.show("develop", "README.md"), f.show("master", "README.md"));
  assert.equal(git(decoy, ["for-each-ref"]), "", "the decoy gained no refs");
  assert.equal(fs.existsSync(path.join(decoyGit, "index")), false, "the decoy gained no index");
});

