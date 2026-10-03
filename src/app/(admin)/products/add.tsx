import { useState } from "react";
import { router } from "expo-router";
import { goBack } from "@/utils/navigation";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import ProductForm from "../../../components/admin/ProductForm";
import { useCategories, useManufacturers } from "../../../hooks/useProducts";
import { createCategory, createManufacturer, createProduct } from "../../../services/products";
import { uploadProductImage } from "../../../services/storage";

/** One level deep: the catalog, when there is nothing to pop. */
const onBack = () => goBack("/(admin)/products");

export default function AdminAddProductScreen() {
  const [categoryTerm, setCategoryTerm] = useState("");
  const [manufacturerTerm, setManufacturerTerm] = useState("");
  const { data: categories, loading: catLoading } = useCategories(categoryTerm);
  const { data: manufacturers, loading: manLoading } = useManufacturers(manufacturerTerm);

  return (
    <Screen
      header={
        <ScreenHeader
          title="Add medicine"
          subtitle="New item for the shop"
          onBack={onBack}
        />
      }
    >
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
        submitLabel="Save medicine"
        onSubmit={async (input) => {
          await createProduct(input);
          // Replace (not goBack) so the list screen remounts/focuses and its
          // focus-triggered reload picks up the new row immediately.
          router.replace("/(admin)/products");
        }}
      />
    </Screen>
  );
}
