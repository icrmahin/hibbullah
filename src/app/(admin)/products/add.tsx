import { router } from "expo-router";
import { goBack } from '@/utils/navigation';
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../components/admin/AdminHeader";
import ProductForm from "../../../components/admin/ProductForm";
import LoadingState from "../../../components/common/LoadingState";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useCategories, useManufacturers } from "../../../hooks/useProducts";
import { createProduct } from "../../../services/products";

export default function AdminAddProductScreen() {
  const colors = useThemeColors();
  const { data: categories, loading: catLoading } = useCategories();
  const { data: manufacturers, loading: manLoading } = useManufacturers();

  if (catLoading || manLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Add product" subtitle="Create new catalog item" />
        <LoadingState label="Loading form" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Add product" subtitle="Create new catalog item" />
      <ProductForm
        categories={categories}
        manufacturers={manufacturers}
        submitLabel="Save product"
        onSubmit={async (input) => {
          await createProduct(input);
          goBack();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
