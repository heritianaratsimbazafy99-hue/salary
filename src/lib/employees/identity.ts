import { z } from "zod";

// Ignore ASCII letter case; preserve every other Unicode code point (including
// accents and ß). This deliberately avoids locale/Unicode-version-dependent
// uppercasing. PostgreSQL implements the same ECMAScript boundary whitespace.
export function canonicalEmployeeId(value: string): string {
  return value.trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export const EmployeeIdSchema = z.string().transform(canonicalEmployeeId)
  .refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 80,
    "Le matricule doit contenir entre 1 et 80 caractères.");
