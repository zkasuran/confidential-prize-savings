/** @type import('solidity-docgen').UserConfig */
const config = {
  outputDir: "../docs/contracts",
  pages: "files",
  templates: "docs-templates",
  exclude: ["test"],
  pageExtension: ".md",
};

export default config;
