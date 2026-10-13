// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Linter, type Rule } from "eslint";

const require = createRequire(import.meta.url);
const adapter = require("../../../vendor/next-eslint-glob") as {
  globSync: (pattern: string, options: Record<string, unknown>) => string[];
};
const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs") as {
  getRootDirs: (context: { cwd: string; settings: { next?: { rootDir?: string | string[] } } }) => string[];
};
const nextPlugin = require("@next/eslint-plugin-next") as {
  rules: Record<string, Rule.RuleModule>;
};

let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(path.join(tmpdir(), "salary-eslint-glob-"));
  for (const directory of ["apps/payroll/pages", "apps/hr/pages", "apps/.hidden", "packages/ui"]) {
    mkdirSync(path.join(fixture, directory), { recursive: true });
  }
  writeFileSync(path.join(fixture, "apps/payroll/pages/payroll.tsx"), "export default function Page() {}");
  writeFileSync(path.join(fixture, "apps/hr/pages/team.tsx"), "export default function Page() {}");
  writeFileSync(path.join(fixture, "apps/README.md"), "not a directory");
});

afterEach(() => rmSync(fixture, { recursive: true, force: true }));

describe("Next ESLint directory glob replacement", () => {
  it("loads the safe replacement through the installed plugin dependency", () => {
    const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
    expect(pluginRequire("fast-glob/package.json").name).toBe("@salary/next-eslint-glob");
  });

  it.each([
    ["apps/payroll", ["apps/payroll"]],
    ["apps/*", ["apps/hr", "apps/payroll"]],
    ["apps/{payroll,hr}", ["apps/hr", "apps/payroll"]],
    ["apps/@(payroll|hr)", ["apps/hr", "apps/payroll"]],
    ["apps/p?yroll", ["apps/payroll"]],
    ["apps/[hp]*", ["apps/hr", "apps/payroll"]],
    ["apps/**", ["apps/hr", "apps/hr/pages", "apps/payroll", "apps/payroll/pages"]],
    ["missing/*", []],
  ])("preserves fast-glob directory results for %s", (pattern, expected) => {
    const result = adapter.globSync(path.join(fixture, pattern as string), { onlyDirectories: true });
    expect(result.every((directory) => path.isAbsolute(directory))).toBe(true);
    expect(result.map((directory) => path.relative(fixture, directory)).sort()).toEqual(expected);
  });

  it("rejects unexpected consumer options instead of silently ignoring them", () => {
    expect(() => adapter.globSync(fixture, { onlyDirectories: false })).toThrow(TypeError);
    expect(() => adapter.globSync(fixture, { onlyDirectories: true, deep: 1 })).toThrow(TypeError);
  });

  it("preserves relative directory results for relative root patterns", () => {
    const pattern = path.join(path.relative(process.cwd(), fixture), "apps/*");
    const result = adapter.globSync(pattern, { onlyDirectories: true });
    expect(result.every((directory) => !path.isAbsolute(directory))).toBe(true);
    expect(result.map((directory) => path.relative(fixture, path.resolve(directory))).sort())
      .toEqual(["apps/hr", "apps/payroll"]);
  });

  it.each(["apps/{01..03}", "apps/{1..5..2}"])("rejects unsupported ranges explicitly: %s", (pattern) => {
    expect(() => adapter.globSync(path.join(fixture, pattern), { onlyDirectories: true }))
      .toThrow("use explicit brace alternatives");
  });

  it("preserves the installed plugin's default, string and array root discovery", () => {
    expect(getRootDirs({ cwd: fixture, settings: {} })).toEqual([fixture]);
    for (const rootDir of [path.join(fixture, "apps/{hr,payroll}"), [path.join(fixture, "apps/hr"), path.join(fixture, "apps/payroll")]]) {
      expect(getRootDirs({ cwd: fixture, settings: { next: { rootDir } } })
        .map((directory) => path.relative(fixture, directory)).sort()).toEqual(["apps/hr", "apps/payroll"]);
    }
  });

  it("still reports internal HTML links through the actual Next ESLint rule", () => {
    const linter = new Linter();
    const messages = linter.verify(
      'const nav = <><a href="/payroll">Payroll</a><a href="/team">Team</a><a href="https://example.com">External</a></>;',
      [{
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { next: nextPlugin },
        settings: { next: { rootDir: path.join(fixture, "apps/{hr,payroll}") } },
        rules: { "next/no-html-link-for-pages": "error" },
      }],
      { filename: "navigation.js" },
    );
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.ruleId === "next/no-html-link-for-pages")).toBe(true);
    expect(messages.map((message) => message.message).join(" ")).toContain("/payroll/");
    expect(messages.map((message) => message.message).join(" ")).toContain("/team/");
  });
});
