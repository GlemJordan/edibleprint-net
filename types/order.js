/**
 * @typedef {'round' | 'heart' | 'square' | 'cookie_sheet' | 'full_sheet' | 'custom' | 'waferletter'} ProductShape
 *
 * @typedef {'paid' | 'file_received' | 'ready_to_print' | 'printed' | 'packed' | 'shipped' | 'pickup_ready' | 'picked_up'} ProductionStatus
 *
 * @typedef {{ line1: string, line2?: string, city: string, province: string, postalCode: string, country: string }} ShippingAddress
 *
 * @typedef {{
 *   shape: ProductShape,
 *   shapeLabel: string,
 *   material?: 'icing' | 'wafer',
 *   cutToShape?: boolean,
 *   size: string,
 *   quantity: number,
 *   unitPrice: number,
 *   notes?: string,
 *   imageUrl?: string,
 *   sourceType?: 'upload',
 *   selectedPage?: number,
 *   pageCount?: number,
 *   approvedAt?: string,
 *   catalogDesignId?: string,
 *   customText?: string,
 * }} DesignRecord
 *
 * @typedef {{
 *   orderId: string,
 *   orderNumber: string,
 *   createdAt: string,
 *   isTest: boolean,
 *   customer: { name: string, email?: string, phone?: string },
 *   designs: DesignRecord[],
 *   // What the customer chose at checkout. Absent on orders saved before the
 *   // standard/tracked split — read via resolveOrderShippingMethod().
 *   shippingMethod?: 'pickup' | 'standard' | 'tracked',
 *   shippingCarrier?: string,
 *   shippingCostCharged?: number,
 *   // Packages the order ships in (0 for pickup): one per SHEETS_PER_PACKAGE
 *   // sheets for standard, one for tracked. Absent on orders saved before
 *   // per-package shipping — those were charged for a single package.
 *   shippingPackages?: number,
 *   // Customer's optional "needed by" date, YYYY-MM-DD. Informational; not
 *   // the same as committedDate, which the owner decides.
 *   neededByDate?: string,
 *   shipping: {
 *     method: 'pickup' | 'local_delivery' | 'canada_post_standard' | 'canada_post_express',
 *     label: string,
 *     address?: ShippingAddress,
 *   },
 *   payment: {
 *     stripeSessionId?: string,
 *     stripePaymentIntentId?: string,
 *     amountCents: number,
 *     currency: 'CAD',
 *     status: 'paid' | 'refunded' | 'failed',
 *     method?: 'stripe_card' | 'cash' | 'e_transfer' | 'other',
 *   },
 *   assets: {
 *     orderJsonUrl?: string,
 *     productionSlipUrl?: string,
 *     cloudinaryFolder: string,
 *   },
 *   production: {
 *     status: ProductionStatus,
 *     updatedAt: string,
 *     adminNote?: string,
 *   },
 *   // Single admin-entered date whose MEANING depends on shipping.method:
 *   // the agreed pickup date for a pickup order, or the date the order must
 *   // ship out for everything else. YYYY-MM-DD, no time component — see
 *   // lib/delivery-urgency.js for how it's turned into an urgency bucket.
 *   committedDate?: string,
 *   notes?: string,
 *   urgentFlags?: string[],
 *   notifications?: {
 *     ownerEmailSent?: boolean,
 *     customerEmailSent?: boolean,
 *     customerEmailError?: string,
 *   },
 *   source?: 'stripe' | 'manual',
 *   channel?: 'website' | 'marketplace' | 'instagram' | 'referral' | 'walk_in' | 'other',
 *   saleDate?: string,
 *   externalRef?: string,
 * }} OrderRecord
 */

export {};
