export type ReturnStatus = "PENDING" | "APPROVED" | "REJECTED" | "PROCESSED";

export type ReturnRequest = {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  productName: string;
  quantity: number;
  reason: string;
  status: ReturnStatus;
  createdAt: string;
  /**
   * The order line this return belongs to. Without it the database knows a product was
   * named but not which units to put back, so approval restores nothing.
   */
  orderItemId?: string;
  productId?: string;
  /** When the shop approved it. Profit is given back at this moment, not the order's date. */
  approvedAt?: string;
  /**
   * What happened to the stock on approval, in one plain sentence. Written whether it
   * worked or not, so a return whose units did not come back is visible on the returns
   * screen rather than being a silent loss. Undefined until the return is approved.
   */
  restockNote?: string;
};
