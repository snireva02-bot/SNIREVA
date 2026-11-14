import type { Database } from './database.types';

type E = Database['public']['Enums'];
export type Tone = 'green' | 'amber' | 'red' | 'grey';
export interface StatusMeta { label: string; tone: Tone }

const m = (label: string, tone: Tone): StatusMeta => ({ label, tone });

export const KYC_STATUS: Record<E['kyc_status'], StatusMeta> = {
  not_submitted: m('Not submitted', 'grey'),
  submitted: m('Submitted', 'amber'),
  under_review: m('Under review', 'amber'),
  approved: m('Approved', 'green'),
  rejected: m('Rejected', 'red'),
};

export const DOC_STATUS: Record<E['doc_status'], StatusMeta> = {
  pending: m('Pending', 'amber'),
  approved: m('Approved', 'green'),
  rejected: m('Rejected', 'red'),
};

export const SCOOTER_STATUS: Record<E['scooter_status'], StatusMeta> = {
  available: m('Available', 'green'),
  reserved: m('Reserved', 'amber'),
  rented: m('Rented', 'grey'),
  under_maintenance: m('Maintenance', 'red'),
  retired: m('Retired', 'grey'),
};

export const BOOKING_STATUS: Record<E['booking_status'], StatusMeta> = {
  pending: m('Pending', 'amber'),
  approved: m('Approved', 'green'),
  rejected: m('Rejected', 'red'),
  cancelled: m('Cancelled', 'grey'),
};

export const RENTAL_STATUS: Record<E['rental_status'], StatusMeta> = {
  pending_agreement: m('Awaiting agreement', 'amber'),
  pending_handover: m('Awaiting handover', 'amber'),
  active: m('Active', 'green'),
  overdue: m('Overdue', 'red'),
  returned: m('Returned', 'grey'),
  terminated: m('Terminated', 'grey'),
};

export const PAYMENT_STATUS: Record<E['payment_status'], StatusMeta> = {
  created: m('Pending', 'amber'),
  paid: m('Paid', 'green'),
  failed: m('Failed', 'red'),
  refunded: m('Refunded', 'grey'),
};

export const SERVICE_STATUS: Record<E['service_status'], StatusMeta> = {
  open: m('Open', 'amber'),
  assigned: m('Assigned', 'amber'),
  in_progress: m('In progress', 'amber'),
  resolved: m('Resolved', 'green'),
  closed: m('Closed', 'grey'),
};

export const PAYMENT_METHOD_LABEL: Record<E['payment_method'], string> = {
  upi_gateway: 'UPI (online)',
  cash: 'Cash',
  offline_upi: 'UPI (offline)',
  bank: 'Bank transfer',
};

export const PAYMENT_TYPE_LABEL: Record<E['payment_type'], string> = {
  rent: 'Rent', deposit: 'Deposit', late_fee: 'Late fee', other: 'Other',
};

export const DOC_TYPE_LABEL: Record<E['doc_type'], string> = {
  aadhaar: 'Aadhaar card',
  pan: 'PAN card',
  address_proof: 'Address proof',
  driving_licence: 'Driving licence',
  other: 'Other document',
};

export const PLATFORM_LABEL: Record<E['delivery_platform'], string> = {
  blinkit: 'Blinkit', zepto: 'Zepto', swiggy_instamart: 'Swiggy Instamart',
  swiggy: 'Swiggy', zomato: 'Zomato', other: 'Other',
};

export const SERVICE_CATEGORY_LABEL: Record<E['service_category'], string> = {
  battery: 'Battery', charging: 'Charging', motor: 'Motor', brakes: 'Brakes',
  tyres: 'Tyres', complaint: 'Complaint', other: 'Other',
};

export const ROLE_LABEL: Record<E['user_role'], string> = {
  customer: 'Customer', staff: 'Staff', manager: 'Manager', owner: 'Owner',
};
