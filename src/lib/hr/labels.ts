export const HR_EMPLOYEE_STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE", "CONTRACT_ENDED"] as const;
export type HrEmployeeStatus = (typeof HR_EMPLOYEE_STATUSES)[number];

export const HR_CONTRACT_TYPES = ["CDI", "CDD", "INTERIM", "MISSION"] as const;
export type HrContractType = (typeof HR_CONTRACT_TYPES)[number];

/** Only a CDD requires an end date; interim and mission contracts may have an imprecise term. */
export const CONTRACT_TYPE_LABEL: Record<HrContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERIM: "Intérim",
  MISSION: "Contrat de mission",
};

export const HR_CNAPS_STATUSES = ["TO_DECLARE", "DECLARED", "TO_REGULARIZE"] as const;
export type HrCnapsStatus = (typeof HR_CNAPS_STATUSES)[number];

export const EMPLOYEE_STATUS_LABEL: Record<HrEmployeeStatus, string> = {
  ACTIVE: "Actif",
  ON_LEAVE: "En congé",
  INACTIVE: "Inactif",
  CONTRACT_ENDED: "Fin de contrat",
};

export const CNAPS_STATUS_LABEL: Record<HrCnapsStatus, string> = {
  TO_DECLARE: "À déclarer",
  DECLARED: "Déclaré",
  TO_REGULARIZE: "À régulariser",
};

/** StatusBadge key for each HR status (tone + icon come from the shared badge). */
export const EMPLOYEE_STATUS_BADGE: Record<HrEmployeeStatus, string> = {
  ACTIVE: "ACTIVE",
  ON_LEAVE: "WARNING",
  INACTIVE: "INACTIVE",
  CONTRACT_ENDED: "INACTIVE",
};

export const CNAPS_STATUS_BADGE: Record<HrCnapsStatus, string> = {
  TO_DECLARE: "WARNING",
  DECLARED: "ACTIVE",
  TO_REGULARIZE: "FAILED",
};

export const HR_LEAVE_TYPES = ["PAID_LEAVE", "AUTHORIZED_ABSENCE"] as const;
export type HrLeaveType = (typeof HR_LEAVE_TYPES)[number];
export const HR_LEAVE_STATUSES = ["PENDING", "APPROVED", "REFUSED", "CANCELLED"] as const;
export type HrLeaveStatus = (typeof HR_LEAVE_STATUSES)[number];

export const LEAVE_TYPE_LABEL: Record<HrLeaveType, string> = {
  PAID_LEAVE: "Congé payé",
  AUTHORIZED_ABSENCE: "Absence autorisée",
};

export const LEAVE_STATUS_LABEL: Record<HrLeaveStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvé",
  REFUSED: "Refusé",
  CANCELLED: "Annulé",
};

export const LEAVE_STATUS_BADGE: Record<HrLeaveStatus, string> = {
  PENDING: "WARNING",
  APPROVED: "ACTIVE",
  REFUSED: "FAILED",
  CANCELLED: "INACTIVE",
};

export const BALANCE_MOVEMENT_LABEL: Record<"INITIAL" | "ADJUSTMENT" | "APPROVAL_DEBIT" | "CANCELLATION_CREDIT", string> = {
  INITIAL: "Solde initial",
  ADJUSTMENT: "Correction",
  APPROVAL_DEBIT: "Congé approuvé",
  CANCELLATION_CREDIT: "Congé annulé (recrédit)",
};
