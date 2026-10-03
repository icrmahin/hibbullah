/**
 * The delivery fee, decided by the destination district.
 *
 * The server is the authority — `create_order` computes the fee and writes it onto the
 * order row — because the client cannot be trusted with a number that becomes a charge.
 * This module is the client's copy of the same rule, used only to *show* the customer a
 * figure before they commit. If the two ever disagree, the customer is quoted one total
 * at checkout and charged another, and nothing in the app reports an error: the order
 * simply looks wrong when it arrives. supabase/verify-sql-sync.mjs compares the two rates
 * and the qualifying district name across SQL and TypeScript, so the split cannot open.
 *
 * Defaulting to the higher fee is the whole safety property here. While the rate is
 * flat this changes nothing numerically, and if two tiers ever return, a missing,
 * misspelled or unrecognised district must again charge the higher one: quietly
 * billing every unrecognised address at the cheap rate would be a real leak that
 * nothing would ever surface.
 */
import { INSIDE_DHAKA_DISTRICT, isInsideDhaka } from "../constants/districts";
import { config } from "../constants/config";

/**
 * The delivery charge for an address in `district`.
 *
 * Accepts anything the address form or an old row might contain: null, empty, mixed
 * case, or padded whitespace. Anything that is not the qualifying district gets the
 * standard rate.
 */
export function deliveryFeeForDistrict(district?: string | null): number {
  return isInsideDhaka(district) ? config.deliveryFees.insideDhaka : config.deliveryFees.outsideDhaka;
}

/** The flat delivery fee, for copy where no district is chosen yet. */
export function lowestDeliveryFee(): number {
  return config.deliveryFees.insideDhaka;
}

export { INSIDE_DHAKA_DISTRICT };
