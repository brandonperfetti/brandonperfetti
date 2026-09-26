"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SVG_THEMES,
  aggregateLanguages,
  escapeMarkdownUrl,
  formatMonth,
  formatPercent,
  parseRss,
  render,
  renderArticles,
  renderShipped,
  renderStatsSvg,
  selectLastShipped,
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

test("render does not re-scan substituted values", () => {
  assert.equal(render("{one}", { one: "{two}" }), "{two}");
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
  const sum = langs.reduce((acc, l) => acc + l.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares sum to ${sum}`);
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

const STATS = {
  contributions: { commits: 1487, pullRequests: 107, issues: 238, reviews: 1, total: 1833 },
  languages: [
    { name: "TypeScript", color: "#3178c6", size: 995, share: 0.995 },
    { name: "C<SS>", color: '#66"33', size: 5, share: 0.005 },
  ],
};

test("renderStatsSvg is a self-contained SVG carrying the numbers and languages", () => {
  const svg = renderStatsSvg(STATS, "light");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /1,833/);
  assert.match(svg, /1,487/);
  assert.match(svg, /TypeScript <tspan class="value">100%<\/tspan>/);
  assert.match(svg, /C&lt;SS&gt;/, "language names are XML-escaped");
  assert.match(svg, /fill="#66&quot;33"/, "colours are XML-escaped in attributes");
  assert.match(svg, /<tspan class="value">&lt;1%<\/tspan>/, "a sub-one-percent share is escaped in the legend");
  assert.match(svg, /C&lt;SS&gt; &lt;1%\./, "and in the description");
  assert.doesNotMatch(svg, /<1%/, "no raw '<1%' survives");
  assert.doesNotMatch(svg, /<script/);
  assert.doesNotMatch(svg, /\d{4}-\d{2}-\d{2}/, "no date, so the file only changes when the numbers do");
});

test("renderStatsSvg draws each theme in that theme's colours and rejects unknown themes", () => {
  const light = renderStatsSvg(STATS, "light");
  const dark = renderStatsSvg(STATS, "dark");
  assert.match(light, new RegExp(`fill: ${SVG_THEMES.light.text}`));
  assert.match(dark, new RegExp(`fill: ${SVG_THEMES.dark.text}`));
  assert.notEqual(light, dark);
  assert.throws(() => renderStatsSvg(STATS, "sepia"), /Unknown SVG theme/);
});

test("renderStatsSvg copes with no language data", () => {
  const svg = renderStatsSvg({ contributions: { commits: 0, pullRequests: 0, issues: 0, reviews: 0, total: 0 }, languages: [] });
  assert.match(svg, /No language data\./);
  assert.match(svg, /<g clip-path="url\(#bar\)">\s*<\/g>/);
});

test("statsMarkup is a picture element with absolute dark and light sources", () => {
  const markup = statsMarkup({ light: "assets/l.svg", dark: "assets/d.svg" }, "https://example.com/raw/master/");
  assert.match(markup, /^<picture>\n/);
  assert.match(markup, /<source media="\(prefers-color-scheme: dark\)" srcset="https:\/\/example\.com\/raw\/master\/assets\/d\.svg" \/>/);
  assert.match(markup, /<img src="https:\/\/example\.com\/raw\/master\/assets\/l\.svg" alt="[^"]+" width="495" \/>/);
  assert.match(markup, /<\/picture>$/);
});

test("statsMarkup tolerates a base URL without a trailing slash", () => {
  const markup = statsMarkup({ light: "assets/l.svg", dark: "assets/d.svg" }, "https://example.com/raw/master");
  assert.match(markup, /srcset="https:\/\/example\.com\/raw\/master\/assets\/d\.svg"/);
  assert.match(markup, /src="https:\/\/example\.com\/raw\/master\/assets\/l\.svg"/);
});

test("statsMarkup defaults to the repository's raw URL on the default branch", () => {
  const markup = statsMarkup({ light: "assets/l.svg", dark: "assets/d.svg" });
  assert.match(markup, /src="https:\/\/github\.com\/brandonperfetti\/brandonperfetti\/raw\/master\/assets\/l\.svg"/);
  assert.match(markup, /srcset="https:\/\/github\.com\/brandonperfetti\/brandonperfetti\/raw\/master\/assets\/d\.svg"/);
  assert.doesNotMatch(markup, /(src|srcset)="assets\//, "no relative image path survives");
});

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Brandon Perfetti</title>
    <item>
      <title><![CDATA[Older & Wiser &amp; literal]]></title>
      <link>https://example.com/articles/older</link>
      <guid isPermaLink="false">https://example.com/articles/older</guid>
      <pubDate>Tue, 18 Aug 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Plain &amp; Newer [bracketed]</title>
      <link>https://example.com/articles/newer (1)</link>
      <pubDate>Thu, 24 Sep 2026 17:58:58 GMT</pubDate>
    </item>
  </channel>
</rss>`;

test("parseRss reads CDATA literally, decodes entities in plain text, sorts newest first", () => {
  const items = parseRss(FEED);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Plain & Newer [bracketed]");
  assert.equal(items[0].link, "https://example.com/articles/newer (1)");
  assert.equal(items[0].date.toISOString(), "2026-09-24T17:58:58.000Z");
  assert.equal(items[1].title, "Older & Wiser &amp; literal");
});

test("parseRss rejects an item without a link or with an unparseable date", () => {
  assert.throws(() => parseRss("<rss><item><title>x</title><pubDate>Tue, 18 Aug 2026 12:00:00 GMT</pubDate></item></rss>"), /feed shape has changed/);
  assert.throws(() => parseRss("<rss><item><title>x</title><link>https://e.com</link><pubDate>yesterday</pubDate></item></rss>"), /feed shape has changed/);
});

test("escapeMarkdownUrl percent-encodes what would end or break a markdown link target", () => {
  assert.equal(escapeMarkdownUrl("https://e.com/a (1) b"), "https://e.com/a%20%281%29%20b");
  assert.equal(escapeMarkdownUrl("https://e.com/plain?q=1&r=2"), "https://e.com/plain?q=1&r=2");
});

test("renderArticles escapes markdown in titles and links, and formats the month", () => {
  const out = renderArticles(parseRss(FEED).slice(0, 1));
  assert.equal(out, "- [Plain & Newer \\[bracketed\\]](https://example.com/articles/newer%20%281%29) · Sep 2026");
});

test("renderArticles and renderShipped have an empty state", () => {
  assert.equal(renderArticles([]), "_No articles yet._");
  assert.equal(renderShipped([]), "_Nothing merged recently._");
});

test("selectLastShipped maps search items, sorts by merge time, and limits", () => {
  const item = (n, mergedAt, repo = "brandonperfetti/repo") => ({
    title: `PR ${n}`,
    html_url: `https://github.com/${repo}/pull/${n}`,
    repository_url: `https://api.github.com/repos/${repo}`,
    pull_request: { merged_at: mergedAt },
  });
  // Search order is by update time; the second item merged latest.
  const picked = selectLastShipped(
    [item(1, "2026-09-01T00:00:00Z"), item(2, "2026-09-26T00:00:00Z", "brandonperfetti/other"), item(3, "2026-09-10T00:00:00Z"), item(4, "2026-08-01T00:00:00Z")],
    3,
  );
  assert.deepEqual(
    picked.map((p) => [p.title, p.repo]),
    [["PR 2", "brandonperfetti/other"], ["PR 3", "brandonperfetti/repo"], ["PR 1", "brandonperfetti/repo"]],
  );
  assert.equal(picked[0].url, "https://github.com/brandonperfetti/other/pull/2");
  assert.equal(picked[0].mergedAt.toISOString(), "2026-09-26T00:00:00.000Z");
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
