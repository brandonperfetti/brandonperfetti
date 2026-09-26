#!/usr/bin/env node
"use strict";

// Regenerates README.md from README.template.md.
//
// The template is the source; README.md is generated output that is
// committed so the profile page can serve it. Three placeholders are
// substituted:
//
//   {github_stats}     a <picture> element pointing at two committed SVGs,
//                      assets/github-stats-light.svg and -dark.svg, which this
//                      script also writes: public contributions over the last
//                      twelve months and the language mix across public,
//                      non-fork repositories, from the GitHub GraphQL API.
//   {latest_articles}  the three most recent posts from brandonperfetti.com's
//                      RSS feed.
//   {last_shipped}     the three most recently merged pull requests across
//                      public repositories, from the GitHub search API.
//
// Usage: GITHUB_TOKEN=<token> node index.js
//   Locally: GITHUB_TOKEN="$(gh auth token)" node index.js
//   In Actions the default GITHUB_TOKEN is used; every query is public data.
//
// Node 20 or later (built-in fetch, node:test). No dependencies.

const fs = require("node:fs/promises");
const path = require("node:path");

const LOGIN = "brandonperfetti";
const FEED_URL = "https://brandonperfetti.com/feed.xml";
const GITHUB_API = "https://api.github.com";
const USER_AGENT = `${LOGIN}-profile-readme`;
const TEMPLATE_PATH = "README.template.md";
const README_PATH = "README.md";
const STATS_SVG_PATHS = {
  light: "assets/github-stats-light.svg",
  dark: "assets/github-stats-dark.svg",
};

const ARTICLE_COUNT = 3;
const SHIPPED_COUNT = 3;
const LANGUAGE_COUNT = 6;
// The search API sorts by update time, not merge time. Merging a pull request
// updates it, so the newest merges are at the top of an updated-sorted list
// unless an older merged PR was touched afterwards; one page of 100 is the
// API's maximum and comfortably covers that.
const SEARCH_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// HTTP

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchOk(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`${url}: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }
  return response;
}

// ---------------------------------------------------------------------------
// GitHub stats

const STATS_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      commitContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate }
        contributions { totalCount }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate }
        contributions { totalCount }
      }
      issueContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate }
        contributions { totalCount }
      }
      pullRequestReviewContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate }
        contributions { totalCount }
      }
    }
    repositories(
      first: 100
      ownerAffiliations: OWNER
      isFork: false
      privacy: PUBLIC
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function fetchGithubStats(login, token) {
  const response = await fetchOk(`${GITHUB_API}/graphql`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query: STATS_QUERY, variables: { login } }),
  });
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GraphQL: ${payload.errors.map((e) => e.message).join("; ")}`);
  }
  if (!payload.data?.user) {
    throw new Error(`GraphQL: no user named ${login} in the response`);
  }
  return summarizeStats(payload.data.user);
}

// Counts only what is public, whatever the token can see, so a run with a
// personal token and a run with the Actions token produce the same numbers.
function sumPublic(byRepository) {
  return byRepository
    .filter((entry) => !entry.repository.isPrivate)
    .reduce((total, entry) => total + entry.contributions.totalCount, 0);
}

function summarizeStats(user) {
  const c = user.contributionsCollection;
  const contributions = {
    commits: sumPublic(c.commitContributionsByRepository),
    pullRequests: sumPublic(c.pullRequestContributionsByRepository),
    issues: sumPublic(c.issueContributionsByRepository),
    reviews: sumPublic(c.pullRequestReviewContributionsByRepository),
  };
  contributions.total =
    contributions.commits + contributions.pullRequests + contributions.issues + contributions.reviews;
  return {
    contributions,
    languages: aggregateLanguages(user.repositories.nodes, LANGUAGE_COUNT),
  };
}

function aggregateLanguages(repositories, limit) {
  const bytes = new Map();
  for (const repo of repositories) {
    for (const edge of repo.languages?.edges ?? []) {
      const existing = bytes.get(edge.node.name) ?? { name: edge.node.name, color: edge.node.color, size: 0 };
      existing.size += edge.size;
      bytes.set(edge.node.name, existing);
    }
  }
  const all = [...bytes.values()].sort((a, b) => b.size - a.size);
  const total = all.reduce((sum, lang) => sum + lang.size, 0);
  if (total === 0) return [];
  const top = all.slice(0, limit);
  const rest = all.slice(limit).reduce((sum, lang) => sum + lang.size, 0);
  if (rest > 0) top.push({ name: "Other", color: null, size: rest });
  return top.map((lang) => ({ ...lang, share: lang.size / total }));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(share) {
  const pct = share * 100;
  return `${pct < 1 && pct > 0 ? "<1" : pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// GitHub's own foreground colours for each theme, so the card meets AA
// contrast on the background it is actually shown on. One transparent SVG
// cannot: no single grey reaches 4.5:1 on both white and #0d1117.
const SVG_THEMES = {
  light: { text: "#57606a", strong: "#6e40c9", track: "#d0d7de" },
  dark: { text: "#8b949e", strong: "#a371f7", track: "#30363d" },
};

function renderStatsSvg({ contributions, languages }, theme = "light") {
  const colors = SVG_THEMES[theme];
  if (!colors) throw new Error(`Unknown SVG theme ${theme}`);
  const width = 495;
  const height = 204;
  const fillFor = (lang) => escapeXml(lang.color ?? colors.text);
  const rows = [
    ["Commits", contributions.commits],
    ["Pull requests", contributions.pullRequests],
    ["Issues", contributions.issues],
    ["Reviews", contributions.reviews],
  ];
  const rowSvg = rows
    .map(
      ([label, value], i) =>
        `<text x="24" y="${106 + i * 20}" class="label">${label}</text>` +
        `<text x="216" y="${106 + i * 20}" class="value" text-anchor="end">${formatNumber(value)}</text>`,
    )
    .join("\n  ");

  const barX = 266;
  const barWidth = 205;
  const legendColumnWidth = 112;
  let cursor = barX;
  const segments = languages
    .map((lang) => {
      const w = Math.max(2, Math.round(lang.share * barWidth));
      const segment = `<rect x="${cursor}" y="56" width="${w}" height="8" fill="${fillFor(lang)}" />`;
      cursor += w;
      return segment;
    })
    .join("\n    ");
  const legend = languages
    .map((lang, i) => {
      const x = barX + (i % 2) * legendColumnWidth;
      const y = 86 + Math.floor(i / 2) * 20;
      return (
        `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${fillFor(lang)}" />` +
        `<text x="${x + 16}" y="${y}" class="label">${escapeXml(lang.name)} <tspan class="value">${escapeXml(formatPercent(lang.share))}</tspan></text>`
      );
    })
    .join("\n  ");
  const languageSummary =
    languages.length === 0
      ? "No language data."
      : `Top languages: ${languages.map((l) => `${l.name} ${formatPercent(l.share)}`).join(", ")}.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">GitHub activity for ${LOGIN}</title>
  <desc id="desc">${escapeXml(`${formatNumber(contributions.total)} public contributions in the last twelve months. ${languageSummary}`)}</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Helvetica, Arial, sans-serif; fill: ${colors.text}; }
    .heading { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
    .big { font-size: 34px; font-weight: 700; fill: ${colors.strong}; }
    .label { font-size: 12px; }
    .value { font-size: 12px; font-weight: 600; }
    .footer { font-size: 10px; }
  </style>
  <text x="24" y="30" class="heading">Contributions, last 12 months</text>
  <text x="24" y="72" class="big">${formatNumber(contributions.total)}</text>
  ${rowSvg}
  <text x="${barX}" y="30" class="heading">Top languages</text>
  <rect x="${barX}" y="56" width="${barWidth}" height="8" rx="4" fill="${colors.track}" />
  <g clip-path="url(#bar)">
    ${segments}
  </g>
  <clipPath id="bar"><rect x="${barX}" y="56" width="${barWidth}" height="8" rx="4" /></clipPath>
  ${legend}
  <text x="24" y="${height - 10}" class="footer">Public repositories only · regenerated daily by index.js in this repository</text>
</svg>
`;
}

// GitHub renders <picture> with prefers-color-scheme sources in READMEs, so
// each theme gets the variant drawn for it. Relative paths resolve against
// the branch being viewed (and the default branch on the profile page).
function statsMarkup(svgPaths) {
  const alt = "Public GitHub contributions in the last twelve months and the language mix across public repositories";
  return [
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${svgPaths.dark}" />`,
    `  <img src="${svgPaths.light}" alt="${alt}" width="495" />`,
    "</picture>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Latest articles (RSS 2.0)

function decodeXmlText(raw) {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim(); // CDATA is literal; nothing to decode.
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagText(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlText(match[1]) : "";
}

// The feed is RSS 2.0 written by jpmonette/feed: flat <item> blocks with
// <title>, <link> and <pubDate>. A tag-by-tag read is enough for that shape
// and keeps the script dependency-free; a structural change in the feed
// surfaces as a missing field, which parseRss rejects.
function parseRss(xml) {
  const items = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];
    const title = tagText(block, "title");
    const link = tagText(block, "link");
    const date = new Date(tagText(block, "pubDate"));
    if (!title || !link || Number.isNaN(date.getTime())) {
      throw new Error("RSS item without a title, link or valid pubDate; the feed shape has changed");
    }
    items.push({ title, link, date });
  }
  return items.sort((a, b) => b.date - a.date);
}

async function fetchLatestArticles(feedUrl, count) {
  const response = await fetchOk(feedUrl, { headers: { "User-Agent": USER_AGENT } });
  return parseRss(await response.text()).slice(0, count);
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function escapeMarkdownText(text) {
  return String(text).replace(/([\\[\]*_`<>])/g, "\\$1");
}

// A URL inside "(...)" breaks on parentheses and whitespace; percent-encode
// those (encodeURIComponent leaves parentheses alone, so spell them out).
const MARKDOWN_URL_ESCAPES = { "(": "%28", ")": "%29" };
function escapeMarkdownUrl(url) {
  return String(url).replace(/[()\s]/g, (ch) => MARKDOWN_URL_ESCAPES[ch] ?? encodeURIComponent(ch));
}

function renderArticles(articles) {
  if (articles.length === 0) return "_No articles yet._";
  return articles
    .map((a) => `- [${escapeMarkdownText(a.title)}](${escapeMarkdownUrl(a.link)}) · ${formatMonth(a.date)}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Last shipped (merged pull requests across public repositories)

function selectLastShipped(items, count) {
  return items
    .map((item) => ({
      title: item.title,
      url: item.html_url,
      repo: item.repository_url.replace(/^.*\/repos\//, ""),
      mergedAt: new Date(item.pull_request.merged_at),
    }))
    .sort((a, b) => b.mergedAt - a.mergedAt)
    .slice(0, count);
}

async function fetchLastShipped(login, token, count) {
  const query = encodeURIComponent(`is:pr is:merged is:public author:${login}`);
  const response = await fetchOk(
    `${GITHUB_API}/search/issues?q=${query}&sort=updated&order=desc&per_page=${SEARCH_PAGE_SIZE}`,
    { headers: githubHeaders(token) },
  );
  const payload = await response.json();
  return selectLastShipped(payload.items, count);
}

function renderShipped(pullRequests) {
  if (pullRequests.length === 0) return "_Nothing merged recently._";
  return pullRequests
    .map(
      (pr) =>
        `- **${escapeMarkdownText(pr.repo.split("/")[1])}**: [${escapeMarkdownText(pr.title)}](${escapeMarkdownUrl(pr.url)}) · ${formatMonth(pr.mergedAt)}`,
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Template

function render(template, values) {
  return template.replace(/\{([a-z_]+)\}/g, (match, key) => {
    if (!(key in values)) {
      throw new Error(`Unknown placeholder ${match} in ${TEMPLATE_PATH}`);
    }
    return values[key];
  });
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!token) {
    throw new Error('GITHUB_TOKEN is required (locally: GITHUB_TOKEN="$(gh auth token)" node index.js)');
  }
  const root = __dirname;
  const template = await fs.readFile(path.join(root, TEMPLATE_PATH), "utf8");

  const [stats, articles, shipped] = await Promise.all([
    fetchGithubStats(LOGIN, token),
    fetchLatestArticles(FEED_URL, ARTICLE_COUNT),
    fetchLastShipped(LOGIN, token, SHIPPED_COUNT),
  ]);

  // Render everything before writing anything, so a template error leaves
  // the tree untouched.
  const readme = render(template, {
    github_stats: statsMarkup(STATS_SVG_PATHS),
    latest_articles: renderArticles(articles),
    last_shipped: renderShipped(shipped),
  });
  const svgs = Object.entries(STATS_SVG_PATHS).map(([theme, file]) => [file, renderStatsSvg(stats, theme)]);

  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  for (const [file, svg] of svgs) {
    await fs.writeFile(path.join(root, file), svg);
  }
  await fs.writeFile(path.join(root, README_PATH), readme);
  console.log(
    `Wrote ${README_PATH} and ${svgs.length} SVGs: ${formatNumber(stats.contributions.total)} public contributions, ` +
      `${stats.languages.length} languages, ${articles.length} articles, ${shipped.length} merged PRs.`,
  );
}

module.exports = {
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
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
