require("isomorphic-unfetch");
const { promises: fs } = require("fs");
const path = require("path");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Disable certificate validation temporarily

async function main() {
  const readmeTemplate = (
    await fs.readFile(path.join(process.cwd(), "./README.template.md"))
  ).toString("utf-8");

  const quote = await (
    await fetch("https://api.quotable.io/quotes/random")
  ).json();

  console.log(quote);

  const readme = readmeTemplate
    .replace("{quote}", quote.content)
    .replace("{quote_author}", `- ${quote.author}`);

  await fs.writeFile("README.md", readme);
}

main();
