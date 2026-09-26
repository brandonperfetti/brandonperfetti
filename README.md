[![brandonperfetti.com](https://github.com/brandonperfetti/brandonperfetti/raw/master/assets/header-banner.png)](https://brandonperfetti.com)

<h1 align="center">Brandon Perfetti</h1>

<p align="center">Senior Frontend Engineer · Next.js · React · TypeScript · GraphQL · AI-Augmented Engineering (Claude Code, MCP)</p>

<p align="center">
<a href="https://brandonperfetti.com"><img src="https://img.shields.io/badge/brandonperfetti.com-Portfolio-000000?style=flat&logo=vercel&logoColor=white" alt="Portfolio: brandonperfetti.com" /></a>
<a href="https://brandonperfetti.com/how-i-work"><img src="https://img.shields.io/badge/How_I_work-the_pipeline_and_the_rules-7c3aed?style=flat" alt="How I work" /></a>
<a href="https://github.brandonperfetti.com"><img src="https://img.shields.io/badge/Dashboard-github.brandonperfetti.com-181717?style=flat&logo=github&logoColor=white" alt="GitHub commit dashboard" /></a>
<a href="https://www.linkedin.com/in/brandonperfetti"><img src="https://img.shields.io/badge/LinkedIn-brandonperfetti-0A66C2?style=flat" alt="LinkedIn: brandonperfetti" /></a>
</p>

I lead the frontend of a multi-tenant real-estate platform: Next.js and TypeScript sites on one shared component package, each with its own headless CMS. Most of that work is delivered through AI agents running under a written harness. The agents write code; the deciding happens first, and it happens on paper.

## How I work

Five stages. The first four are specification; only the fifth is code.

1. **Grill the problem.** Before anything is written, I interrogate the goal: what is actually being asked for, what is assumed, what happens if we do nothing. Most of what I cut gets cut here, when cutting is free.
2. **Write the master priority document.** One file a cold reader can pick up and run the next wave from: the decisions and why, the phases, the file-ownership map, the traps.
3. **Cut tickets.** Each one carries its finding in the title and its receipts in the body. This is where "what gets built" stops being a conversation and becomes a contract.
4. **Set the fence.** Which files each agent lane owns, which it must never touch, and which shared manifests have to be serialised rather than parallelised.
5. **Dispatch waves, then review every one.** Agents work inside the fence and hand back. Nothing lands without a review pass.

Four invariants keep it safe, and I have not found a way to drop any of them without paying for it:

- **Two-axis review before acceptance.** Every change is checked against the repo's documented standards and against what the originating ticket asked for.
- **A capability guard decides autonomy.** Whether a lane runs attended or autonomously is a measured decision against five checks, not a mood.
- **Evidence labels.** Every claim is marked as measured, read from source, or inferred, and the three are kept apart.
- **Agents never merge.** A human sits at the irreversible boundary. Always.

The full write-up, including an audit of how I direct agents by one of my own agents, is at [brandonperfetti.com/how-i-work](https://brandonperfetti.com/how-i-work). The agreements themselves are public: [agent-working-agreements](https://github.com/brandonperfetti/agent-working-agreements).

## What it produced

One program is the clearest illustration: a fleet-hardening initiative around incremental static regeneration. Roughly 150 tickets and 426 files across a shared component package, the CMS, the portal and the tenant sites, first commit to fleet promotion in four weeks, in ten reviewed waves, with the fleet end-to-end suite green at every wave.

The number I care about there is not 426. It is ten: the number of times the work stopped and got looked at before any of it reached a release branch.

## Where to look

<table>
<tr>
<td valign="top" width="50%">

### [Agent Working Agreements](https://github.com/brandonperfetti/agent-working-agreements)

The harness itself: evidence labels, the two modes and the guard that picks between them, the git ritual, the stop-list. The changelog shows which rules changed after something bit.

</td>
<td valign="top" width="50%">

### [GitHub commit dashboard](https://github.brandonperfetti.com)

14 charts on PR throughput, cycle time, flow health and release cadence, read server-side from the GitHub API. Next.js 16, Recharts, Vitest. Nobody asked me to build it. [Source](https://github.com/brandonperfetti/github-commit-dashboard).

</td>
</tr>
<tr>
<td valign="top" width="50%">

### [brandonperfetti.com, the source](https://github.com/brandonperfetti/bp-portfolio)

Next.js 16, Payload CMS, Supabase, Clerk, a block page-builder, Storybook, Vitest and Playwright.

</td>
<td valign="top" width="50%">

### [From Runbook to Agent Skill](https://brandonperfetti.com/articles/runbooks-to-agent-skills)

Why runbooks rot and agent skills don't: turning a Next.js upgrade playbook into a Claude skill that executes, verifies, and stays current run over run.

</td>
</tr>
</table>

## Stack

**Core**
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white)
![GraphQL](https://img.shields.io/badge/GraphQL-E10098?style=flat&logo=graphql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)

**AI-augmented engineering**
![Claude Code](https://img.shields.io/badge/Claude_Code-D97757?style=flat&logo=claude&logoColor=white)
![Model Context Protocol](https://img.shields.io/badge/Model_Context_Protocol-000000?style=flat&logo=modelcontextprotocol&logoColor=white)
![Anthropic API](https://img.shields.io/badge/Anthropic_API-191919?style=flat&logo=anthropic&logoColor=white)
![Codex](https://img.shields.io/badge/Codex-000000?style=flat)
![CodeRabbit](https://img.shields.io/badge/CodeRabbit-FF570A?style=flat&logo=coderabbit&logoColor=white)

**Testing**
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat&logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat)

**Data and CMS**
![Payload CMS](https://img.shields.io/badge/Payload_CMS-000000?style=flat&logo=payloadcms&logoColor=white)
![Strapi](https://img.shields.io/badge/Strapi-4945FF?style=flat&logo=strapi&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)

**Delivery**
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat&logo=githubactions&logoColor=white)

## Certificates

| Certificate | Issuer | Issued |
| --- | --- | --- |
| Claude Code for Real Engineers | AIHero.dev | Apr 2026 |
| AI SDK v6 Crash Course | AIHero.dev | Mar 2026 |
| The Complete Next.js Testing Course | JS Mastery | Feb 2026 |
| Build Your Own AI Personal Assistant in TypeScript | AIHero.dev | Dec 2025 |
| Master the Model Context Protocol (MCP) | EpicAI.pro | Nov 2025 |
| Certificate of Interface Design | Shift Nudge | Apr 2026 |
| Automated Accessibility Testing | testingaccessibility.com | Jul 2024 |

## Before that

A decade of data integrations built the depth: helping build a React and GraphQL ingestion platform for 250+ MLS feeds and 10M+ records, SAML/JWT SSO across 100+ platforms, and a re-architecture that cut data-source integration time by 80%.

---

If you are solving the same problem, I would like to compare notes: [LinkedIn](https://www.linkedin.com/in/brandonperfetti) · [brandonperfetti.com](https://brandonperfetti.com) · [X](https://x.com/brandonperfetti)
