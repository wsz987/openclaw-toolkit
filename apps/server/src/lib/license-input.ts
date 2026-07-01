import { z } from 'zod';

export const DEFAULT_LICENSE_TIER = 'basic';
export const DEFAULT_LICENSE_FEATURES: string[] = [];

export const createCompanySchema = z.object({
  name: z.string().trim().min(1),
  contactName: z.string().trim().optional().nullable(),
  contactEmail: z.string().trim().email().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

export const createLicenseKeySchema = z.object({
  companyId: z.string().uuid().optional(),
  companyName: z.string().trim().min(1).optional(),
  tier: z.string().trim().min(1).default(DEFAULT_LICENSE_TIER),
  features: z.array(z.string().trim().min(1)).default(DEFAULT_LICENSE_FEATURES),
  expiresAt: z.string().datetime().optional().nullable(),
  maxActivations: z.number().int().positive().optional().nullable(),
  activationCode: z.string().trim().optional(),
  note: z.string().trim().optional().nullable(),
  issuedBy: z.string().trim().optional().nullable()
}).refine((value) => Boolean(value.companyId || value.companyName), {
  message: 'companyId or companyName is required'
});

export const validateLicenseKeySchema = z.object({
  activationCode: z.string().trim().min(1),
  machineId: z.string().trim().optional().nullable(),
  appVersion: z.string().trim().optional().nullable()
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type CreateLicenseKeyInput = z.infer<typeof createLicenseKeySchema>;
export type ValidateLicenseKeyInput = z.infer<typeof validateLicenseKeySchema>;
