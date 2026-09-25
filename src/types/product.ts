export type Product = {
  id: string;
  name: string;
  brand: string;
  genericName: string;
  manufacturerId: string;
  categoryId: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  costPrice?: number;
  stock: number;
  unit: string;
  image?: string;
  /** Primary product image — app-level field, maps to image_path on backend */
  primaryImage?: string;
  /** Secondary product image — app-level field, stored alongside primary */
  secondaryImage?: string;
  isActive: boolean;
  isFeatured?: boolean;
  batchNumber?: string;
  expiryDate?: string;
  /** Joined by the product list functions; absent on a single-row fetch. */
  categoryName?: string;
  manufacturerName?: string;
  createdAt: string;
};

export type ProductListItem = Product;
