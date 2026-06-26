import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { InvitationConfirmation } from "@/components/imports/InvitationConfirmation";
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

describe("InvitationConfirmation", () => {
  it("renders the empty state", () => {
    render(createElement(InvitationConfirmation, { candidates: [] }));

    expect(screen.getByText("Aucun nouveau salarie a inviter.")).toBeTruthy();
  });

  it("renders candidates with a checked invitation checkbox", () => {
    render(
      createElement(InvitationConfirmation, {
        candidates: [{ employeeId: "EMP-003", email: "three@example.com", employeeName: "Three" }],
      }),
    );

    expect(screen.getByRole("heading", { name: "Nouveaux salaries detectes" })).toBeTruthy();
    expect(screen.getByText("Three")).toBeTruthy();
    expect(screen.getByText("three@example.com")).toBeTruthy();

    const checkbox = screen.getByRole("checkbox", { name: /Three/ }) as HTMLInputElement;
    expect(checkbox.name).toBe("inviteEmployeeId");
    expect(checkbox.value).toBe("EMP-003");
    expect(checkbox.checked).toBe(true);
  });

  it("keeps long candidate details wrappable on narrow screens", () => {
    const longName = "A Very Long Employee Name That Should Wrap Without Breaking The Row";
    const longEmail = "averylongemployeeemailaddresswithoutnaturalbreaks@example-company-with-a-long-domain.test";

    render(
      createElement(InvitationConfirmation, {
        candidates: [{ employeeId: "EMP-004", email: longEmail, employeeName: longName }],
      }),
    );

    const name = screen.getByText(longName);
    const email = screen.getByText(longEmail);
    const textWrapper = name.parentElement;
    const label = name.closest("label");

    expect(label?.className).toContain("items-start");
    expect(textWrapper?.className).toContain("min-w-0");
    expect(textWrapper?.className).toContain("flex-1");
    expect(name.className).toContain("break-words");
    expect(email.className).toContain("break-all");
  });
});
