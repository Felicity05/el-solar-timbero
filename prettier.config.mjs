/** @type {import("prettier").Config} */
const config = {
  printWidth: 200,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  singleAttributePerLine: false,
  plugins: ["prettier-plugin-tailwindcss"],
};

export default config;
