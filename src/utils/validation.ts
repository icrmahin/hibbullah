import { isBdPhone } from './phone';

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Accepts any Bangladeshi format; validation and normalization share one implementation. */
export const isValidPhone = (value?: string | null): boolean => isBdPhone(value);

export const isEmpty = (value?: string | null): boolean =>
  !value || !value.trim();

/**
 * Reads a discount the way an owner types it: `10` and `10%` are both ten percent.
 *
 * The form used to carry three numbers that had to be kept in step by hand — a customer
 * price, an old price and a percentage — and the percentage was applied against whichever
 * one happened to be in the box. One box now carries the whole idea, so this is the single
 * place that decides what the box means, and it is deliberately strict: the value goes into
 * an integer column and it derives the price a customer pays, so anything that is not a
 * whole number from 1 to 100 comes back as a message rather than as a number nobody typed.
 *
 *   "10"   "10%"   "10 %"   ->  10
 *   ""                      ->  0   (empty means "no discount" — the optional case)
 *   "0"                     ->  error: an empty box already says that
 *   "101"   "-5"            ->  error
 *   "10.5"                  ->  error: the column is a whole percentage, so rounding
 *                               would quietly store something else
 *   "10% off"   "ten"       ->  error
 *
 * `percent` is a percentage *of a price*, never a price, so the caller recomputes the final
 * price from the untouched customer price every time it saves. The stored price is never fed
 * back in, which is what makes applying the discount twice impossible rather than merely
 * unlikely.
 */
export type DiscountPercentResult =
  | { ok: true; percent: number }
  | { ok: false; message: string };

export const parseDiscountPercent = (raw?: string | null): DiscountPercentResult => {
  const value = (raw ?? "").trim();
  if (!value) return { ok: true, percent: 0 };
  // Digits, an optional space, an optional single "%" — and nothing else. A sign, a decimal
  // point, a second "%" or a trailing word all fail here rather than being quietly dropped.
  if (!/^\d+\s*%?$/.test(value))
    return { ok: false, message: "Use a whole percentage, e.g. 10 or 10%." };

  const percent = Number.parseInt(value, 10);
  if (percent === 0)
    return { ok: false, message: "Enter 1 to 100, or leave it empty for no discount." };
  if (percent > 100)
    return { ok: false, message: "The most you can discount is 100%." };
  return { ok: true, percent };
};
