#!/usr/bin/env node
"use strict";

// Regenerates README.md from README.template.md.
//
// The template is the source; README.md is generated output that is
// committed so the profile page can serve it. Three placeholders are
// substituted:
//
//   {github_stats}     an <img> pointing at assets/github-stats.svg, which
//                      this script also writes: public contributions over the
//                      last twelve months and the language mix across public,
//                      non-fork repositories, from the GitHub GraphQL API.
//   {latest_articles}  the three most recent posts from brandonperfetti.com's
//                      RSS feed.
//   {last_shipped}     the three most recently merged pull requests across
//                      public repositories, from the GitHub search API.
//
// Usage: GITHUB_TOKEN=<token> node index.js
//   Locally: GITHUB_TOKEN="$(gh auth token)" node index.js
//   In Actions the default GITHUB_TOKEN is enough; every query is public data.
//
// Node 20 or later (built-in fetch, node:test). No dependencies.

const fs = require("node:fs/promises");
const path = require("node:path");

const LOGIN = "brandonperfetti";
const FEED_URL = "https://brandonperfetti.com/feed.xml";
const GITHUB_API = "https://api.github.com";
const TEMPLATE_PATH = "README.template.md";
const README_PATH = "README.md";
const STATS_SVG_PATH = "assets/github-stats.svg";

const ARTICLE_COUNT = 3;
const SHIPPED_COUNT = 3;
const LANGUAGE_COUNT = 6;

// ---------------------------------------------------------------------------
// HTTP

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${LOGIN}-profile-readme`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchOk(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
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
  if (rest > 0) top.push({ name: "Other", color: "#8b949e", size: rest });
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

// One SVG that reads on GitHub light and dark: transparent ground, mid-grey
// text, language colours from GitHub's own linguist palette.
function renderStatsSvg({ contributions, languages }, generatedOn) {
  const width = 495;
  const height = 204;
  const text = "#768390";
  const strong = "#7c3aed";
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
    .join("\n    ");

  const barX = 266;
  const barWidth = 205;
  const legendColumnWidth = 112;
  let cursor = barX;
  const segments = languages
    .map((lang) => {
      const w = Math.max(2, Math.round(lang.share * barWidth));
      const segment = `<rect x="${cursor}" y="56" width="${w}" height="8" fill="${escapeXml(lang.color ?? text)}" />`;
      cursor += w;
      return segment;
    })
    .join("\n    ");
  const legend = languages
    .map((lang, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = barX + col * legendColumnWidth;
      const y = 86 + row * 20;
      return (
        `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${escapeXml(lang.color ?? text)}" />` +
        `<text x="${x + 16}" y="${y}" class="label">${escapeXml(lang.name)} <tspan class="value">${formatPercent(lang.share)}</tspan></text>`
      );
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">GitHub activity for ${LOGIN}</title>
  <desc id="desc">${formatNumber(contributions.total)} public contributions in the last twelve months. Top languages: ${languages.map((l) => `${l.name} ${formatPercent(l.share)}`).join(", ")}.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Helvetica, Arial, sans-serif; fill: ${text}; }
    .heading { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
    .big { font-size: 34px; font-weight: 700; fill: ${strong}; }
    .label { font-size: 12px; }
    .value { font-size: 12px; font-weight: 600; }
    .footer { font-size: 10px; }
  </style>
  <text x="24" y="30" class="heading">Contributions, last 12 months</text>
  <text x="24" y="72" class="big">${formatNumber(contributions.total)}</text>
  ${rowSvg}
  <text x="${barX}" y="30" class="heading">Top languages</text>
  <rect x="${barX}" y="56" width="${barWidth}" height="8" rx="4" fill="${text}" fill-opacity="0.15" />
  <g clip-path="url(#bar)">
    ${segments}
  </g>
  <clipPath id="bar"><rect x="${barX}" y="56" width="${barWidth}" height="8" rx="4" /></clipPath>
  ${legend}
  <text x="24" y="${height - 10}" class="footer">Public repositories only · regenerated ${generatedOn} by index.js in this repository</text>
</svg>
`;
}

// ---------------------------------------------------------------------------
// Latest articles (RSS 2.0)

function decodeXmlText(raw) {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const text = cdata ? cdata[1] : raw;
  return text
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
// surfaces as an empty title or link, which parseRss rejects.
function parseRss(xml) {
  const items = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];
    const title = tagText(block, "title");
    const link = tagText(block, "link");
    const pubDate = tagText(block, "pubDate");
    if (!title || !link) {
      throw new Error("RSS item without a title or link; the feed shape has changed");
    }
    items.push({ title, link, date: new Date(pubDate) });
  }
  return items.sort((a, b) => b.date - a.date);
}

async function fetchLatestArticles(feedUrl, count) {
  const response = await fetchOk(feedUrl, { headers: { "User-Agent": `${LOGIN}-profile-readme` } });
  return parseRss(await response.text()).slice(0, count);
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function escapeMarkdownText(text) {
  return String(text).replace(/([\\[\]*_`<>])/g, "\\$1");
}

function renderArticles(articles) {
  if (articles.length === 0) return "_No articles yet._";
  return articles
    .map((a) => `- [${escapeMarkdownText(a.title)}](${a.link}) · ${formatMonth(a.date)}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Last shipped (merged pull requests across public repositories)

async function fetchLastShipped(login, token, count) {
  const query = encodeURIComponent(`is:pr is:merged is:public author:${login}`);
  const response = await fetchOk(
    `${GITHUB_API}/search/issues?q=${query}&sort=updated&order=desc&per_page=30`,
    { headers: githubHeaders(token) },
  );
  const payload = await response.json();
  return payload.items
    .map((item) => ({
      title: item.title,
      url: item.html_url,
      repo: item.repository_url.replace(/^.*\/repos\//, ""),
      mergedAt: new Date(item.pull_request.merged_at),
    }))
    .sort((a, b) => b.mergedAt - a.mergedAt)
    .slice(0, count);
}

function renderShipped(pullRequests) {
  if (pullRequests.length === 0) return "_Nothing merged recently._";
  return pullRequests
    .map((pr) => `- **${escapeMarkdownText(pr.repo.split("/")[1])}**: [${escapeMarkdownText(pr.title)}](${pr.url}) · ${formatMonth(pr.mergedAt)}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Template

function render(template, values) {
  const output = template.replace(/\{([a-z_]+)\}/g, (match, key) => {
    if (!(key in values)) {
      throw new Error(`Unknown placeholder ${match} in ${TEMPLATE_PATH}`);
    }
    return values[key];
  });
  return output;
}

function statsMarkup(svgPath) {
  return `<img src="${svgPath}" alt="Public GitHub contributions in the last twelve months and the language mix across public repositories" width="495" />`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!token) {
    throw new Error("GITHUB_TOKEN is required (locally: GITHUB_TOKEN=\"$(gh auth token)\" node index.js)");
  }
  const cwd = process.cwd();
  const template = await fs.readFile(path.join(cwd, TEMPLATE_PATH), "utf8");

  const [stats, articles, shipped] = await Promise.all([
    fetchGithubStats(LOGIN, token),
    fetchLatestArticles(FEED_URL, ARTICLE_COUNT),
    fetchLastShipped(LOGIN, token, SHIPPED_COUNT),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  await fs.mkdir(path.dirname(path.join(cwd, STATS_SVG_PATH)), { recursive: true });
  await fs.writeFile(path.join(cwd, STATS_SVG_PATH), renderStatsSvg(stats, today));

  const readme = render(template, {
    github_stats: statsMarkup(STATS_SVG_PATH),
    latest_articles: renderArticles(articles),
    last_shipped: renderShipped(shipped),
  });
  await fs.writeFile(path.join(cwd, README_PATH), readme);
  console.log(
    `Wrote ${README_PATH} and ${STATS_SVG_PATH}: ${formatNumber(stats.contributions.total)} public contributions, ` +
      `${stats.languages.length} languages, ${articles.length} articles, ${shipped.length} merged PRs.`,
  );
}

module.exports = {
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
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
