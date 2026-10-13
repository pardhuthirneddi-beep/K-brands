/** Shared constants for validation limits. */
export const MAX_SIZE_GUIDE = 2000;

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: 'AN', name: 'Andaman and Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'CT', name: 'Chhattisgarh' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'JK', name: 'Jammu and Kashmir' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LA', name: 'Ladakh' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MN', name: 'Manipur' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OR', name: 'Odisha' },
  { code: 'PB', name: 'Punjab' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TG', name: 'Telangana' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TR', name: 'Tripura' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
];

export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];

export const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const BOTTOM_SIZES = ['28', '30', '32', '34', '36', '38', '40'];

export const RETURN_REASONS: { code: string; label: string }[] = [
  { code: 'size_too_small', label: 'Size was too small' },
  { code: 'size_too_large', label: 'Size was too large' },
  { code: 'not_as_described', label: 'Not as described on the site' },
  { code: 'colour_differs', label: 'Colour differed from the photos' },
  { code: 'damaged_or_defect', label: 'Damaged or defective on arrival' },
  { code: 'ordered_by_mistake', label: 'Ordered by mistake' },
  { code: 'no_longer_needed', label: 'No longer needed' },
  { code: 'other', label: 'Something else' },
];

export const CANCELLATION_REASONS: { code: string; label: string }[] = [
  { code: 'found_better_price', label: 'Found a better price elsewhere' },
  { code: 'ordered_by_mistake', label: 'Ordered by mistake' },
  { code: 'change_size', label: 'I want to change size or colour' },
  { code: 'delivery_too_slow', label: 'Delivery estimate was too long' },
  { code: 'payment_issue', label: 'Payment did not go through' },
  { code: 'other', label: 'Something else' },
];
