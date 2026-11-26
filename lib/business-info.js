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

// What the public sees: the Google Business Profile pin, structured data and
// the pickup info on the site. The unit number stays in the pickup email.
export const BUSINESS_PUBLIC_STREET = '40 Burslem St';
export const BUSINESS_PUBLIC_ADDRESS =
  `${BUSINESS_PUBLIC_STREET}, ${BUSINESS_ADDRESS.city}, ${BUSINESS_ADDRESS.province}`;
// Opens Google Maps on the pickup location, for directions.
export const BUSINESS_MAPS_URL = 'https://www.google.com/maps/search/?api=1&query='
  + encodeURIComponent(`${BUSINESS_PUBLIC_ADDRESS} ${BUSINESS_ADDRESS.postalCode}`);

// Text and WhatsApp only: the business doesn't take calls, so never link this
// number with tel: or publish it as a schema.org telephone.
export const BUSINESS_PHONE_DISPLAY = '519-694-9266';
export const BUSINESS_PHONE_E164 = '+15196949266'; // for sms: links
export const BUSINESS_WHATSAPP_URL = 'https://wa.me/15196949266';
