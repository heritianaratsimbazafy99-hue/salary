import { z } from "zod";

export const PublicationConfirmationSchema = z.object({
  confirmed: z.literal(true),
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();

export const ManualCorrectionSchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(5).max(500),
  changes: z.object({
    grossAmount: z.number().finite().min(0).max(999999999999).optional(),
    deductionsTotal: z.number().finite().min(0).max(999999999999).optional(),
    netAmount: z.number().finite().min(-999999999999).max(999999999999).optional(),
    notes: z.string().max(1000).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0),
}).strict();

export const PublicationReviewSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  recipients: z.array(z.object({ employeeId: z.string(), employeeName: z.string(), email: z.email(), departed: z.boolean().optional(), nameDiffers: z.boolean().optional() })),
});
export type PublicationReview = z.infer<typeof PublicationReviewSchema>;
