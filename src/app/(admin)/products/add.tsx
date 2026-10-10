import { useState } from "react";
import { router } from "expo-router";
import { goBack } from "@/utils/navigation";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import ProductForm from "../../../components/admin/ProductForm";
import { createProduct } from "../../../services/products";
import { uploadProductImage } from "../../../services/storage";

/** One level deep: the catalog, when there is nothing to pop. */
const onBack = () => goBack("/(admin)/products");

export default function AdminAddProductScreen() {
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
        onUploadImage={(localUri, slot, productId) => uploadProductImage(localUri, productId, slot)}
        submitLabel="Save medicine"
        onSubmit={async (input) => {
          await createProduct(input);
          router.replace("/(admin)/products");
        }}
      />
    </Screen>
  );
}
