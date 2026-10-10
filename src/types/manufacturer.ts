// This file is intentionally left as a stub.
// The manufacturers table has been removed; company_name is now a free-text field on products.
export type Manufacturer = {
  id: string;
  name: string;
  country?: string;
  website?: string;
  productCount?: number;
};
