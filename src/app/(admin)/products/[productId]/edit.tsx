import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../../components/admin/AdminHeader";
import ProductForm from "../../../../components/admin/ProductForm";
import EmptyState from "../../../../components/common/EmptyState";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import { useCategories, useManufacturers, useProduct } from "../../../../hooks/useProducts";
import { createCategory, createManufacturer, updateProduct } from "../../../../services/products";
import { uploadProductImage, reclaimSupersededProductImages } from "../../../../services/storage";

export default function AdminEditProductScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId as string;

  const { product, loading, error, reload } = useProduct(productId);
  const [categoryTerm, setCategoryTerm] = useState("");
  const [manufacturerTerm, setManufacturerTerm] = useState("");
  const { data: categories, loading: catLoading } = useCategories(categoryTerm);
  const { data: manufacturers, loading: manLoading } = useManufacturers(manufacturerTerm);

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
        key={product.id}
        product={product}
        categories={categories}
        manufacturers={manufacturers}
        onSearchCategories={setCategoryTerm}
        onSearchManufacturers={setManufacturerTerm}
        categoriesLoading={catLoading}
        manufacturersLoading={manLoading}
        onCreateCategory={(name) => createCategory({ name })}
        onCreateManufacturer={(name) => createManufacturer({ name })}
        onUploadImage={(localUri, slot, id) => uploadProductImage(localUri, id, slot)}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          // A partial update: `undefined` leaves a field alone, so the admin only
          // changes what they actually typed in.
          const saved = await updateProduct(productId, input);

          // An unsigned Cloudinary upload cannot replace an existing asset, so a
          // swapped photo leaves its predecessor behind. Reclaim it now that the row
          // no longer points at it -- after the save, never before, or a cancelled
          // edit would be left referencing a file that no longer exists. Anything the
          // admin did not change still matches, and is left untouched.
          const superseded = {
            primary: product.primaryImage !== saved.primaryImage ? product.primaryImage : null,
            secondary: product.secondaryImage !== saved.secondaryImage ? product.secondaryImage : null,
          };
          if (superseded.primary || superseded.secondary) {
            void reclaimSupersededProductImages(productId, superseded);
          }

          goBack();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
