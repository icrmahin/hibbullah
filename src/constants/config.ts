export const config = {
  appName: "Hibbullah",
  currency: "BDT",
  currencySymbol: "৳ ",
  orderCycleHours: 24,
  defaultPageSize: 20,
  supportEmail: "hibbullah82026@gmail.com",
  /**
   * Delivery is a flat ৳80 while serving Dhaka only. The district split is kept
   * (server rule + client helper still agree via verify:sql-sync) so the
   * two-tier pricing can return without restructuring, but both tiers are 80.
   *
   * `deliveryFee` below remains as the fallback for an order row with no stored fee.
   */
  deliveryFees: {
    insideDhaka: 80,
    outsideDhaka: 80,
  },
  deliveryFee: 80,
  lowStockThreshold: 10,
  expiryWarningDays: 60,
};

export default config;
