import { describe, expect, it } from "vitest";
import packageJson from "../../../package.json";

describe("project scaffold", () => {
  it("exposes the required verification script", () => {
    expect(packageJson.scripts.verify).toBe("npm run typecheck && npm run test && npm run build");
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
