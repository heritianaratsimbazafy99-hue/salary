import { describe, expect, it } from "vitest";

type PolicyCase = {
  actorRole: string;
  resourceAgencyId: string;
  actorAgencyId?: string;
  ownerProfileId?: string;
  actorProfileId: string;
  isCurrentPublished?: boolean;
};

function canSelectPayslip(input: PolicyCase): boolean {
  if (input.actorRole === "hr_central" || input.actorRole === "super_admin") return true;
  if (input.actorRole === "agency_manager") return input.actorAgencyId === input.resourceAgencyId;
  if (input.actorRole === "employee") {
    return input.actorProfileId === input.ownerProfileId && input.isCurrentPublished === true;
  }

  return false;
}

function canPublish(input: PolicyCase): boolean {
  return input.actorRole === "agency_manager" && input.actorAgencyId === input.resourceAgencyId;
}

function canReadAuditLogs(actorRole: string): boolean {
  return actorRole === "hr_central" || actorRole === "super_admin";
}

describe("RLS policy model", () => {
  it("denies employee access to another employee payslip", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_b",
        resourceAgencyId: "agency_1",
        isCurrentPublished: true,
      }),
    ).toBe(false);
  });

  it("allows employee access to own currently published payslip", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_a",
        resourceAgencyId: "agency_1",
        isCurrentPublished: true,
      }),
    ).toBe(true);
  });

  it("denies employee access to own replaced payslip version", () => {
    expect(
      canSelectPayslip({
        actorRole: "employee",
        actorProfileId: "profile_employee_a",
        ownerProfileId: "profile_employee_a",
        resourceAgencyId: "agency_1",
        isCurrentPublished: false,
      }),
    ).toBe(false);
  });

  it("denies manager publication outside assigned agency", () => {
    expect(
      canPublish({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        resourceAgencyId: "agency_2",
      }),
    ).toBe(false);
  });

  it("allows manager publication inside assigned agency", () => {
    expect(
      canPublish({
        actorRole: "agency_manager",
        actorProfileId: "profile_manager",
        actorAgencyId: "agency_1",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(true);
  });

  it("denies HR central publication", () => {
    expect(
      canPublish({
        actorRole: "hr_central",
        actorProfileId: "profile_hr",
        resourceAgencyId: "agency_1",
      }),
    ).toBe(false);
  });

  it("restricts audit log reads to global readers", () => {
    expect(canReadAuditLogs("hr_central")).toBe(true);
    expect(canReadAuditLogs("super_admin")).toBe(true);
    expect(canReadAuditLogs("agency_manager")).toBe(false);
    expect(canReadAuditLogs("employee")).toBe(false);
  });
});
