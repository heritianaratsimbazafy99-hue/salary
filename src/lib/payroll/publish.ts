export function nextVersionNumber(existingVersions: number[]) {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export type PublishResult = {
  payslipId: string;
  versionId: string;
  versionNumber: number;
};
