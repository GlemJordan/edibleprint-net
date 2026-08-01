// Single source of truth for the business's physical address and phone
// number. Used for the CASL-compliance sender-identification footer in
// transactional email, pickup instructions (same physical address, same
// value — there is only one), and the site's LocalBusiness structured data
// (app/layout.js). Change it here; nothing else should hardcode these.

export const BUSINESS_ADDRESS = {
  line1: '40 Burslem St Unit 7',
  city: 'London',
  province: 'ON',
  // Verified against real-estate listings for this exact unit (REALTOR.ca
  // listing for "7 - 40 Burslem Street, London") — matches what the site
  // already had, confirmed correct, not assumed.
  postalCode: 'N5W 2V7',
  country: 'CA',
};

export const BUSINESS_ADDRESS_ONE_LINE =
  `${BUSINESS_ADDRESS.line1}, ${BUSINESS_ADDRESS.city}, ${BUSINESS_ADDRESS.province} ${BUSINESS_ADDRESS.postalCode}`;

export const BUSINESS_PHONE_DISPLAY = '519-694-9266';
export const BUSINESS_PHONE_E164 = '+15196949266'; // for tel: links and structured data
