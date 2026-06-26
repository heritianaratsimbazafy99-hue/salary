import { PayrollRowSchema, type PayrollRow } from "@/lib/payroll/schema";

type PayrollAdjustmentData = Partial<PayrollRow>;
type PayrollManualAdjustments = Partial<Record<keyof PayrollRow, { before: unknown; after: unknown }>>;

const PAYROLL_ROW_KEYS = Object.keys(PayrollRowSchema.shape) as Array<keyof PayrollRow>;

export function applyManualAdjustment(original: PayrollAdjustmentData, changes: PayrollAdjustmentData) {
  const normalizedData: PayrollAdjustmentData = { ...original };
  const adjustmentEntries: Array<[keyof PayrollRow, { before: unknown; after: unknown }]> = [];

  PAYROLL_ROW_KEYS.forEach((key) => {
    const adjustment = applyPayrollChange(normalizedData, original, changes, key);
    if (adjustment) {
      adjustmentEntries.push(adjustment);
    }
  });

  const manualAdjustments = Object.fromEntries(adjustmentEntries) as PayrollManualAdjustments;

  return {
    normalizedData,
    manualAdjustments,
    hasManualAdjustments: adjustmentEntries.length > 0,
  };
}

function applyPayrollChange<Key extends keyof PayrollRow>(
  normalizedData: PayrollAdjustmentData,
  original: PayrollAdjustmentData,
  changes: PayrollAdjustmentData,
  key: Key,
): [Key, { before: unknown; after: unknown }] | null {
  if (!Object.prototype.hasOwnProperty.call(changes, key)) {
    return null;
  }

  const before = original[key];
  const after = changes[key];
  normalizedData[key] = after;

  if (before === after) {
    return null;
  }

  return [key, { before, after }];
}
