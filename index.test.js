"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateLanguages,
  formatMonth,
  formatPercent,
  parseRss,
  render,
  renderArticles,
  renderShipped,
  renderStatsSvg,
  statsMarkup,
  summarizeStats,
} = require("./index.js");

test("render substitutes every known placeholder", () => {
  const out = render("a {one} b {two} c", { one: "1", two: "2" });
  assert.equal(out, "a 1 b 2 c");
});

test("render leaves text without placeholders untouched", () => {
  const template = "![x](https://img.shields.io/badge/a-b-c?style=flat)\n<div align=\"center\">\n";
  assert.equal(render(template, {}), template);
});

test("render throws on an unknown placeholder rather than emitting it", () => {
  assert.throws(() => render("{nope}", { one: "1" }), /Unknown placeholder \{nope\}/);
});

test("summarizeStats counts only public repositories", () => {
  const user = {
    contributionsCollection: {
      commitContributionsByRepository: [
        { repository: { isPrivate: false }, contributions: { totalCount: 10 } },
        { repository: { isPrivate: true }, contributions: { totalCount: 90 } },
      ],
      pullRequestContributionsByRepository: [
        { repository: { isPrivate: false }, contributions: { totalCount: 3 } },
      ],
      issueContributionsByRepository: [
        { repository: { isPrivate: false }, contributions: { totalCount: 2 } },
        { repository: { isPrivate: true }, contributions: { totalCount: 7 } },
      ],
      pullRequestReviewContributionsByRepository: [],
    },
    repositories: { nodes: [] },
  };
  const stats = summarizeStats(user);
  assert.deepEqual(stats.contributions, { commits: 10, pullRequests: 3, issues: 2, reviews: 0, total: 15 });
  assert.deepEqual(stats.languages, []);
});

test("aggregateLanguages sums bytes across repositories and folds the tail into Other", () => {
  const repos = [
    { languages: { edges: [{ size: 600, node: { name: "TypeScript", color: "#3178c6" } }, { size: 100, node: { name: "CSS", color: "#663399" } }] } },
    { languages: { edges: [{ size: 200, node: { name: "TypeScript", color: "#3178c6" } }, { size: 50, node: { name: "Shell", color: "#89e051" } }, { size: 50, node: { name: "Python", color: "#3572A5" } }] } },
    { languages: null },
  ];
  const langs = aggregateLanguages(repos, 2);
  assert.deepEqual(
    langs.map((l) => [l.name, l.size]),
    [["TypeScript", 800], ["CSS", 100], ["Other", 100]],
  );
  assert.equal(langs[0].share, 0.8);
  assert.equal(langs.reduce((sum, l) => sum + l.share, 0), 1);
});

test("aggregateLanguages returns an empty list when nothing has a language", () => {
  assert.deepEqual(aggregateLanguages([{ languages: { edges: [] } }], 6), []);
});

test("formatPercent keeps one decimal under ten percent and marks traces", () => {
  assert.equal(formatPercent(0.8), "80%");
  assert.equal(formatPercent(0.0523), "5.2%");
  assert.equal(formatPercent(0.004), "<1%");
  assert.equal(formatPercent(0), "0.0%");
});

test("renderStatsSvg is a self-contained SVG carrying the numbers and languages", () => {
  const svg = renderStatsSvg(
    {
      contributions: { commits: 1487, pullRequests: 107, issues: 238, reviews: 1, total: 1833 },
      languages: [
        { name: "TypeScript", color: "#3178c6", size: 9, share: 0.9 },
        { name: "C<SS>", color: "#663399", size: 1, share: 0.1 },
      ],
    },
    "2026-09-26",
  );
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /1,833/);
  assert.match(svg, /1,487/);
  assert.match(svg, /TypeScript <tspan class="value">90%<\/tspan>/);
  assert.match(svg, /C&lt;SS&gt;/, "language names are XML-escaped");
  assert.match(svg, /regenerated 2026-09-26/);
  assert.doesNotMatch(svg, /<script/);
});

test("statsMarkup points at the committed SVG", () => {
  assert.match(statsMarkup("assets/github-stats.svg"), /^<img src="assets\/github-stats\.svg" alt="[^"]+" width="495" \/>$/);
});

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Brandon Perfetti</title>
    <item>
      <title><![CDATA[Older &amp; Wiser]]></title>
      <link>https://example.com/articles/older</link>
      <guid isPermaLink="false">https://example.com/articles/older</guid>
      <pubDate>Tue, 18 Aug 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Plain &amp; Newer [bracketed]</title>
      <link>https://example.com/articles/newer</link>
      <pubDate>Thu, 24 Sep 2026 17:58:58 GMT</pubDate>
    </item>
  </channel>
</rss>`;

test("parseRss reads CDATA and plain titles, decodes entities, sorts newest first", () => {
  const items = parseRss(FEED);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Plain & Newer [bracketed]");
  assert.equal(items[0].link, "https://example.com/articles/newer");
  assert.equal(items[0].date.toISOString(), "2026-09-24T17:58:58.000Z");
  assert.equal(items[1].title, "Older & Wiser");
});

test("parseRss rejects an item without a link", () => {
  assert.throws(() => parseRss("<rss><item><title>x</title></item></rss>"), /feed shape has changed/);
});

test("renderArticles escapes markdown in titles and formats the month", () => {
  const out = renderArticles(parseRss(FEED).slice(0, 1));
  assert.equal(out, "- [Plain & Newer \\[bracketed\\]](https://example.com/articles/newer) · Sep 2026");
});

test("renderArticles and renderShipped have an empty state", () => {
  assert.equal(renderArticles([]), "_No articles yet._");
  assert.equal(renderShipped([]), "_Nothing merged recently._");
});

test("renderShipped names the repository and links the pull request", () => {
  const out = renderShipped([
    { repo: "brandonperfetti/github-commit-dashboard", title: "Release: subdomain README", url: "https://github.com/brandonperfetti/github-commit-dashboard/pull/9", mergedAt: new Date("2026-09-26T03:29:02Z") },
  ]);
  assert.equal(out, "- **github-commit-dashboard**: [Release: subdomain README](https://github.com/brandonperfetti/github-commit-dashboard/pull/9) · Sep 2026");
});

test("formatMonth is UTC and short", () => {
  assert.equal(formatMonth(new Date("2026-01-31T23:59:59Z")), "Jan 2026");
});
