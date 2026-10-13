import { z } from 'zod';
import { INDIAN_STATES } from '../domain/constants.ts';

const stateCodes = new Set(INDIAN_STATES.map((s) => s.code));

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(180)
  .email('Enter a valid email address.')
  .refine((v) => !v.includes('..'), 'Enter a valid email address.');

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.')
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number.');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.')
  .or(z.literal(''));

export const pincodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.');

export const addressSchema = z.object({
  recipientName: z.string().trim().min(2, 'Enter the recipient’s name.').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.'),
  line1: z.string().trim().min(4, 'Enter the flat/house number and street.').max(160),
  line2: z.string().trim().max(160).optional().nullable(),
  locality: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2, 'Enter your city.').max(80),
  stateCode: z.string().trim().length(2).refine((v) => stateCodes.has(v.toUpperCase()), 'Choose a valid state.'),
  pincode: pincodeSchema,
  countryCode: z.string().trim().length(2).default('IN'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2, 'Enter your name.').max(120),
  phone: phoneSchema.optional(),
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, {
  message: 'The two passwords do not match.',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

export const cartAddSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(30).default(1),
});

export const cartUpdateSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(0).max(30),
});

export const checkoutSchema = z.object({
  email: emailSchema,
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.'),
  shipping: addressSchema,
  billingSame: z.boolean().default(true),
  billing: addressSchema.optional(),
  useCod: z.boolean().default(false),
  customerNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(80),
});

export const cancelSchema = z.object({
  orderNumber: z.string().trim().min(4).max(30),
  reason: z.string().trim().min(2).max(60),
  detail: z.string().trim().max(600).optional(),
});

export const returnSchema = z.object({
  orderNumber: z.string().trim().min(4).max(30),
  orderLineId: z.coerce.number().int().positive().optional().nullable(),
  type: z.enum(['return', 'exchange']).default('return'),
  reasonCode: z.string().trim().min(2).max(60),
  detail: z.string().trim().max(800).optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(120),
  email: emailSchema,
  orderRef: z.string().trim().max(30).optional(),
  topic: z.enum(['order', 'product', 'sizing', 'returns', 'press', 'other']).default('other'),
  message: z.string().trim().min(20, 'Please give us a little more detail (20+ characters).').max(3000),
});

export const couponSchema = z.object({ code: z.string().trim().min(1).max(40) });

export const adminProductSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{3,90}$/, 'Use lowercase letters, numbers and hyphens.'),
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(6000).optional().nullable(),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  compareAtCents: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  categorySlug: z.string().trim().max(80).optional().nullable(),
  garmentType: z.string().trim().max(60).optional().nullable(),
  fabric: z.string().trim().max(120).optional().nullable(),
  fit: z.string().trim().max(60).optional().nullable(),
  status: z.enum(['draft', 'published', 'archived', 'out_of_stock']),
  isSample: z.coerce.boolean(),
  taxBps: z.coerce.number().int().min(0).max(4000).default(0),
});

export const adminVariantSchema = z.object({
  productSlug: z.string().trim().min(2).max(90),
  sku: z.string().trim().min(2).max(60),
  size: z.string().trim().max(20).optional().nullable(),
  colorName: z.string().trim().max(60).optional().nullable(),
  priceCents: z.coerce.number().int().min(0).optional().nullable(),
  stockQty: z.coerce.number().int().min(0).max(100000).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

export function parseWith<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { ok: true; value: z.infer<T> } | { ok: false; fieldErrors: Record<string, string>; message: string } {
  const res = schema.safeParse(data);
  if (res.success) return { ok: true, value: res.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of res.error.issues.slice(0, 12)) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors, message: 'Please correct the highlighted fields.' };
}
