import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "@/lib/payroll/csv";

describe("payroll CSV encoding", () => {
  it.each([
    ["=cmd()", "'=cmd()"],
    ["+cmd()", "'+cmd()"],
    ["-cmd()", "'-cmd()"],
    ["@cmd()", "'@cmd()"],
    ["\t=cmd()", "'\t=cmd()"],
    ["\r=cmd()", '"\'\r=cmd()"'],
    ["\n=cmd()", '"\'\n=cmd()"'],
    [" =cmd()", "' =cmd()"],
  ])("neutralizes formula-leading value %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("still quotes delimiters, quotes, and newlines", () => {
    expect(csvCell('A,"B"')).toBe('"A,""B"""');
    expect(csvCell("A\nB")).toBe('"A\nB"');
    expect(csvCell("A;B")).toBe('"A;B"');
  });

  it("serializes rows with a trailing newline", () => {
    expect(toCsv(["name"], [["=Alice"]])).toBe("name\n'=Alice\n");
  });
});
