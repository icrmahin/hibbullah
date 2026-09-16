import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../../components/admin/AdminHeader";
import ProductForm from "../../../../components/admin/ProductForm";
import EmptyState from "../../../../components/common/EmptyState";
import ErrorState from "../../../../components/common/ErrorState";
import LoadingState from "../../../../components/common/LoadingState";
import colors from "../../../../constants/colors";
import { updateProduct } from "../../../../services/admin/adminProductService";
import { getCategories } from "../../../../services/categoryService";
import { getManufacturers } from "../../../../services/manufacturerService";
import { getProductById } from "../../../../services/productService";
import type { Category } from "../../../../types/category";
import type { Manufacturer } from "../../../../types/manufacturer";
import type { Product } from "../../../../types/product";
import { normalizeError } from "../../../../utils/errorHandling";

export default function AdminEditProductScreen() {
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId;

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const [item, categoryList, manufacturerList] = await Promise.all([
        getProductById(productId),
        getCategories(),
        getManufacturers(),
      ]);
      if (!item) {
        setError("Product not found.");
        setProduct(null);
        return;
      }
      setProduct(item);
      setCategories(categoryList);
      setManufacturers(manufacturerList);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title="Edit product" subtitle="Update catalog item" />
      {loading ? (
        <LoadingState label="Loading product…" />
      ) : error ? (
        <ErrorState title="Could not load product" message={error} onRetry={load} />
      ) : !product ? (
        <EmptyState
          title="Product not found"
          message="This product may have been removed."
          actionLabel="Back to products"
          onAction={() => router.back()}
        />
      ) : (
        <ProductForm
          product={product}
          categories={categories}
          manufacturers={manufacturers}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            await updateProduct(product.id, input);
            router.back();
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
});