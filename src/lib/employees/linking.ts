export type EmployeeIdentityInput = {
  agencyId: string;
  employeeId: string;
  email: string;
  fullName: string;
};

export type EmployeeIdentity = EmployeeIdentityInput;

export function normalizeEmployeeIdentity(input: EmployeeIdentityInput): EmployeeIdentity {
  return {
    agencyId: input.agencyId,
    employeeId: input.employeeId.trim().toUpperCase(),
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim().replace(/\s+/g, " "),
  };
}
