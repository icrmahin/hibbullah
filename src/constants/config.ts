export const config = {
  appName: "Hibbullah",
  currency: "BDT",
  currencySymbol: "৳ ",
  orderCycleHours: 24,
  defaultPageSize: 20,
  supportEmail: "hibbullah82026@gmail.com",
  /**
   * Delivery is priced by destination district, not flat. `insideDhaka` applies to Dhaka
   * District only — Gazipur, Narayanganj and the rest of Dhaka Division are further out
   * and stay on the standard rate, which is the point of splitting it.
   *
   * These two numbers are duplicated in `create_order`, which is what actually charges the
   * customer. supabase/verify-sql-sync.mjs fails if they ever drift, because a drift means
   * the checkout total and the real charge disagree with no error anywhere.
   *
   * `deliveryFee` below remains as the fallback for an order row with no stored fee, and
   * is deliberately the standard rate rather than the cheaper one.
   */
  deliveryFees: {
    insideDhaka: 80,
    outsideDhaka: 150,
  },
  deliveryFee: 150,
  lowStockThreshold: 10,
  expiryWarningDays: 60,
};

export default config;
