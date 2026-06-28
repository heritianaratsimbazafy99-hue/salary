export type InvitationCandidate = {
  employeeId: string;
  email: string;
  employeeName: string;
};

export const EMPLOYEE_INVITATION_STATUS = {
  ACCEPTED: "ACCEPTED",
  EXPIRED: "EXPIRED",
  PENDING: "PENDING",
  REVOKED: "REVOKED",
} as const;

export type EmployeeInvitationStatus =
  (typeof EMPLOYEE_INVITATION_STATUS)[keyof typeof EMPLOYEE_INVITATION_STATUS];

export type ImportEmployeeCandidate = InvitationCandidate & {
  exists: boolean;
};

export function buildInvitationCandidates(rows: ImportEmployeeCandidate[]): InvitationCandidate[] {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    if (row.exists || seen.has(row.employeeId)) return [];
    seen.add(row.employeeId);
    return [{ employeeId: row.employeeId, email: row.email, employeeName: row.employeeName }];
  });
}
