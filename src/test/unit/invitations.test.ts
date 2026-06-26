import { describe, expect, it } from "vitest";
import { buildInvitationCandidates } from "@/lib/employees/invitations";

describe("buildInvitationCandidates", () => {
  it("returns unknown employees only once", () => {
    const result = buildInvitationCandidates([
      { employeeId: "EMP-001", email: "one@example.com", employeeName: "One", exists: false },
      { employeeId: "EMP-001", email: "one@example.com", employeeName: "One", exists: false },
      { employeeId: "EMP-002", email: "two@example.com", employeeName: "Two", exists: true },
    ]);

    expect(result).toEqual([{ employeeId: "EMP-001", email: "one@example.com", employeeName: "One" }]);
  });
});
