import { router, useLocalSearchParams } from "expo-router";
import { goBack } from '@/utils/navigation';
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../../components/admin/AdminHeader";
import ProductForm from "../../../../components/admin/ProductForm";
import EmptyState from "../../../../components/common/EmptyState";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import { useCategories, useManufacturers, useProduct } from "../../../../hooks/useProducts";
import { updateProduct } from "../../../../services/products";

export default function AdminEditProductScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId as string;

  const { product, loading, error, reload } = useProduct(productId);
  const { data: categories, loading: catLoading } = useCategories();
  const { data: manufacturers, loading: manLoading } = useManufacturers();

  if (loading || catLoading || manLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Edit product" subtitle="Update catalog item" />
        <LoadingState label="Loading product" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Edit product" subtitle="Update catalog item" />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Edit product" subtitle="Update catalog item" />
        <EmptyState
          title="Product not found"
          message="This product may have been removed."
          actionLabel="Back to products"
          onAction={() => goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Edit product" subtitle="Update catalog item" />
      <ProductForm
        product={product}
        categories={categories}
        manufacturers={manufacturers}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          await updateProduct(productId, input);
          goBack();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
