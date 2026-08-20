/**
 * @typedef {'round' | 'heart' | 'square' | 'cookie_sheet' | 'full_sheet' | 'custom' | 'waferletter'} ProductShape
 *
 * @typedef {'paid' | 'file_received' | 'ready_to_print' | 'printed' | 'packed' | 'shipped' | 'pickup_ready'} ProductionStatus
 *
 * @typedef {{ line1: string, line2?: string, city: string, province: string, postalCode: string, country: string }} ShippingAddress
 *
 * @typedef {{
 *   shape: ProductShape,
 *   shapeLabel: string,
 *   material?: 'icing' | 'wafer',
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
 *   },
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
