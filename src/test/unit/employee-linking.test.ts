import { describe, expect, it } from "vitest";
import { normalizeEmployeeIdentity } from "@/lib/employees/linking";

describe("normalizeEmployeeIdentity", () => {
  it("normalizes stable employee identity", () => {
    expect(
      normalizeEmployeeIdentity({
        agencyId: "agency-1",
        employeeId: " emp-001 ",
        email: "USER@EXAMPLE.COM",
        fullName: " Jean Rakoto ",
      }),
    ).toEqual({
      agencyId: "agency-1",
      employeeId: "EMP-001",
      email: "user@example.com",
      fullName: "Jean Rakoto",
    });
  });
});
