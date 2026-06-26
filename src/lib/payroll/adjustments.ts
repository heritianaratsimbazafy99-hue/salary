type PayrollData = Record<string, unknown>;

export function applyManualAdjustment(original: PayrollData, changes: PayrollData) {
  const normalizedData = { ...original, ...changes };
  const manualAdjustments: Record<string, { before: unknown; after: unknown }> = {};

  Object.entries(changes).forEach(([key, after]) => {
    const before = original[key];
    if (before !== after) {
      manualAdjustments[key] = { before, after };
    }
  });

  return {
    normalizedData,
    manualAdjustments,
    hasManualAdjustments: Object.keys(manualAdjustments).length > 0,
  };
}
