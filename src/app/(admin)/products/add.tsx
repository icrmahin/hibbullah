import { useState } from "react";
import { goBack } from "@/utils/navigation";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../components/admin/AdminHeader";
import ProductForm from "../../../components/admin/ProductForm";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useCategories, useManufacturers } from "../../../hooks/useProducts";
import { createCategory, createManufacturer, createProduct } from "../../../services/products";
import { uploadProductImage } from "../../../services/storage";

export default function AdminAddProductScreen() {
  const colors = useThemeColors();
  const [categoryTerm, setCategoryTerm] = useState("");
  const [manufacturerTerm, setManufacturerTerm] = useState("");
  const { data: categories, loading: catLoading } = useCategories(categoryTerm);
  const { data: manufacturers, loading: manLoading } = useManufacturers(manufacturerTerm);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Add product" subtitle="Create new catalog item" />
      <ProductForm
        categories={categories}
        manufacturers={manufacturers}
        onSearchCategories={setCategoryTerm}
        onSearchManufacturers={setManufacturerTerm}
        categoriesLoading={catLoading}
        manufacturersLoading={manLoading}
        onCreateCategory={(name) => createCategory({ name })}
        onCreateManufacturer={(name) => createManufacturer({ name })}
        // The form owns the product id, because the image has to be uploaded to
        // `products/<id>` before the product row exists.
        onUploadImage={(localUri, slot, productId) => uploadProductImage(localUri, productId, slot)}
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
