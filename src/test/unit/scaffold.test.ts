import { describe, expect, it } from "vitest";
import packageJson from "../../../package.json";

describe("project scaffold", () => {
  it("exposes the required verification script", () => {
    expect(packageJson.scripts.verify).toBe("npm run typecheck && npm run test && npm run build");
  });
});
