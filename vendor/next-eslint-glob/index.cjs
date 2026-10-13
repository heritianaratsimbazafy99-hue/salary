"use strict";

// CommonJS is required by the upstream ESLint plugin.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { globSync: tinyGlobSync } = require("tinyglobby");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isAbsolute } = require("node:path");

// Deliberately supports only the API used by Next's get-root-dirs utility.
// Fail explicitly if a future plugin version starts using another contract.
exports.globSync = function globSync(pattern, options) {
  if (
    typeof pattern !== "string" ||
    options?.onlyDirectories !== true ||
    Object.keys(options).some((key) => key !== "onlyDirectories")
  ) {
    throw new TypeError("Next ESLint root discovery requires a string pattern and onlyDirectories: true");
  }

  for (const match of pattern.matchAll(/(?<!\\)\{(-?\d+|[a-zA-Z])\.\.(-?\d+|[a-zA-Z])(\.\.[^{}]+)?\}/g)) {
    if (match[3] || /^-?0\d/.test(match[1]) || /^-?0\d/.test(match[2])) {
      throw new TypeError("Next ESLint rootDir: use explicit brace alternatives instead of padded or stepped ranges");
    }
  }

  // fast-glob's terminal globstar matches descendants, excluding its parent.
  const directoryPattern = pattern.replace(/(^|\/)\*\*\/?$/, "$1**/*");
  return tinyGlobSync(directoryPattern, {
    onlyDirectories: true,
    expandDirectories: false,
    absolute: isAbsolute(pattern),
  }).map((directory) => directory.length > 1 ? directory.replace(/\/$/, "") : directory);
};
