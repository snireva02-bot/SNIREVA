/** Fallback only. The live value always comes from `settings.weekly_rent`. */
export const RENT_AMOUNT = 1820;
export const RENTAL_PERIOD_DAYS = 7;
export const DEFAULT_BRANCH_ID = '00000000-0000-0000-0000-000000000001';

export const BUCKETS = {
  kyc: 'kyc',
  scooters: 'scooters',
  handover: 'handover',
  service: 'service',
  agreements: 'agreements',
  receipts: 'receipts',
  avatars: 'avatars',
} as const;

export const DOC_TYPES_REQUIRED = ['aadhaar', 'pan', 'driving_licence'] as const;
