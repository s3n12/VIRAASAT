import { z } from 'zod';
import { isValidEmailAddress, normalizeIndianMobile, sanitizeFullName } from '../utils/crypto.ts';

export const registrationSessionIdSchema = z
  .string()
  .trim()
  .regex(/^reg_[A-Za-z0-9_-]{12,64}$/, 'Invalid registration session identifier.')
  .optional();

export const sendEmailOtpSchema = z.object({
  fullName: z
    .string({ message: 'Full name is required.' })
    .transform(sanitizeFullName)
    .refine((val) => val.length >= 2, 'Please enter your full name (at least 2 characters).')
    .refine((val) => val.length <= 120, 'Full name must be 120 characters or fewer.'),
  email: z
    .string({ message: 'Email address is required.' })
    .trim()
    .refine(isValidEmailAddress, 'Please enter a valid email address.'),
  registrationSessionId: registrationSessionIdSchema,
});

export const sendSmsOtpSchema = z.object({
  mobile: z
    .string({ message: 'Indian mobile number is required.' })
    .trim()
    .refine(
      (val) => normalizeIndianMobile(val) !== null,
      'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g. +91 9876543210).'
    ),
  registrationSessionId: registrationSessionIdSchema,
});

export const verifyOtpSchema = z.object({
  channel: z.enum(['email', 'mobile'], { message: 'Channel must be email or mobile.' }),
  identifier: z.string({ message: 'Identifier is required.' }).trim().min(3, 'Identifier is required.'),
  otp: z
    .string({ message: 'OTP is required.' })
    .trim()
    .regex(/^\d{6}$/, 'Enter the complete 6-digit verification code.'),
  registrationSessionId: registrationSessionIdSchema,
});

export const registerAccountSchema = z.object({
  fullName: z
    .string({ message: 'Full name is required.' })
    .transform(sanitizeFullName)
    .refine((val) => val.length >= 2, 'Full name is required.')
    .refine((val) => val.length <= 120, 'Full name must be 120 characters or fewer.'),
  emailVerificationToken: z
    .string({ message: 'Email verification token is required.' })
    .trim()
    .min(20, 'Valid email verification token is required.'),
  mobileVerificationToken: z
    .string({ message: 'Mobile verification token is required.' })
    .trim()
    .min(20, 'Valid mobile verification token is required.'),
});

export type SendEmailOtpInput = z.infer<typeof sendEmailOtpSchema>;
export type SendSmsOtpInput = z.infer<typeof sendSmsOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RegisterAccountInput = z.infer<typeof registerAccountSchema>;
