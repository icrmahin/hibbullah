import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../components/admin/AdminHeader";
import ProductForm from "../../../components/admin/ProductForm";
import ErrorState from "../../../components/common/ErrorState";
import LoadingState from "../../../components/common/LoadingState";
import colors from "../../../constants/colors";
import { createProduct } from "../../../services/admin/adminProductService";
import { getCategories } from "../../../services/categoryService";
import { getManufacturers } from "../../../services/manufacturerService";
import type { Category } from "../../../types/category";
import type { Manufacturer } from "../../../types/manufacturer";
import { normalizeError } from "../../../utils/errorHandling";

export default function AdminAddProductScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoryList, manufacturerList] = await Promise.all([
        getCategories(),
        getManufacturers(),
      ]);
      setCategories(categoryList);
      setManufacturers(manufacturerList);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title="Add product" subtitle="Create new catalog item" />
      {loading ? (
        <LoadingState label="Loading form…" />
      ) : error ? (
        <ErrorState
          title="Could not load product form"
          message={error}
          onRetry={load}
        />
      ) : (
        <ProductForm
          categories={categories}
          manufacturers={manufacturers}
          submitLabel="Save product"
          onSubmit={async (input) => {
            await createProduct(input);
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