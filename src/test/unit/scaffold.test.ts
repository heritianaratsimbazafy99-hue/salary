import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import packageJson from "../../../package.json";

describe("project scaffold", () => {
  it("exposes the required verification script", () => {
    expect(packageJson.scripts.verify).toBe("npm run lint && npm run typecheck && npm run test && npm run build");
    expect(packageJson.scripts["check:secrets"]).toBe("node scripts/check-secrets.mjs");
    expect(packageJson.scripts["verify:ci"]).toBe(
      "npm run check:secrets && npm run verify && npm audit --audit-level=high",
    );
    expect(packageJson.scripts["verify:full"]).toBe(
      "npm run check:secrets && npm run verify && npm run test:e2e && npm run db:advisors && npm audit --audit-level=high",
    );
  });

  it("defines production automation files", () => {
    expect(existsSync(".github/workflows/ci.yml")).toBe(true);
    expect(existsSync(".github/dependabot.yml")).toBe(true);
    expect(existsSync(".env.production.example")).toBe(true);
    expect(existsSync("docs/operations/supabase-backup-restore.md")).toBe(true);
    expect(existsSync("docs/verification/production-readiness.md")).toBe(true);
  });

  it("runs the required CI gates in GitHub Actions", () => {
    const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(ciWorkflow).toContain("npm run verify:ci");
    expect(ciWorkflow).toContain("supabase/setup-cli@v2");
    expect(ciWorkflow).toContain("npm run test:e2e -- --project=chromium");
    expect(ciWorkflow).toContain("npm run db:advisors");
  });

  it("uses the approved Excel parser dependency", () => {
    expect(packageJson.dependencies.exceljs).toBeDefined();
    expect(packageJson.dependencies).not.toHaveProperty("xlsx");
  });

  it("pins dependency versions explicitly", () => {
    const allDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(Object.values(allDependencies)).not.toContain("latest");
  });
});
