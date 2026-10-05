import { config } from "../constants/config";

export const formatCurrency = (value: number): string =>
  `${config.currencySymbol}${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

export const calculateDiscount = (
  price: number,
  discountPercent: number,
): number => Number((price * (discountPercent / 100)).toFixed(2));

/**
 * The price after a percentage off, rounded to the kobo the column stores.
 *
 * `price` here is the price *before* the discount. `calculateDiscount` rounds the amount
 * taken off and this rounds the remainder, so `100 - 10%` is exactly 90 and `100 - 100%` is
 * exactly 0 — never 89.99999999999999 written into `numeric(12,2)`.
 */
export const getSalePrice = (price: number, discountPercent: number): number =>
  Number((price - calculateDiscount(price, discountPercent)).toFixed(2));

/**
 * One basket's subtotal and its discount, from the numbers the product already carries.
 *
 * `price` is the final price: what the product card shows, what `create_order` charges and
 * what the receipt records. So the discount cannot be `price × discountPercent` — that takes
 * a percentage off a price that has already had it removed, which is how the cart came to
 * quote a total the server would not charge. The saving is instead the gap between the
 * struck-through original and the final price, which is the same figure the card draws
 * beside it, so the two screens cannot disagree about what an item costs.
 *
 * `subtotal - discount` therefore lands on `price × quantity`, which is exactly the line the
 * order stores: the cart, the checkout and the receipt all total the same figure.
 */
export const sumBasket = (
  lines: { price: number; originalPrice?: number | null; quantity: number }[],
): { subtotal: number; discount: number } => {
  let subtotal = 0;
  let discount = 0;
  for (const line of lines) {
    // An original price below what is being charged is not a discount, so it is ignored —
    // `ProductCard` uses the same `originalPrice > price` test before drawing it.
    const was =
      line.originalPrice != null && line.originalPrice > line.price
        ? line.originalPrice
        : line.price;
    subtotal += was * line.quantity;
    discount += (was - line.price) * line.quantity;
  }
  const round2 = (value: number) => Math.round(value * 100) / 100;
  return { subtotal: round2(subtotal), discount: round2(discount) };
};
