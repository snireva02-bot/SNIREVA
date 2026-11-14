import { z } from 'zod';

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, '').slice(-10))
  .refine((s) => /^[6-9]\d{9}$/.test(s), 'Enter a valid 10-digit mobile number');

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name'),
  address: z.string().trim().min(8, 'Enter your full address'),
  emergency_contact_name: z.string().trim().min(2, 'Enter a contact name'),
  emergency_contact_phone: phoneSchema,
  delivery_platform: z.enum(['blinkit', 'zepto', 'swiggy_instamart', 'swiggy', 'zomato', 'other'], {
    message: 'Choose your delivery platform',
  }),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const serviceRequestSchema = z.object({
  category: z.enum(['battery', 'charging', 'motor', 'brakes', 'tyres', 'complaint', 'other']),
  description: z.string().trim().min(10, 'Describe the problem in a few words (10+ characters)'),
});

export const offlinePaymentSchema = z.object({
  rental_id: z.string().uuid(),
  amount: z.coerce.number().positive('Amount must be more than 0'),
  type: z.enum(['rent', 'deposit', 'late_fee', 'other']),
  method: z.enum(['cash', 'offline_upi', 'bank']),
  notes: z.string().trim().max(500).optional(),
});

export const scooterSchema = z.object({
  code: z.string().trim().min(2, 'Scooter ID is required'),
  model: z.string().trim().min(2, 'Model is required'),
  chassis_no: z.string().trim().optional(),
  motor_no: z.string().trim().optional(),
  battery_no: z.string().trim().optional(),
  battery_details: z.string().trim().optional(),
  weekly_rent: z.coerce.number().positive().optional().nullable(),
});
