import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import Screen from "../../../../components/common/Screen";
import ScreenHeader from "../../../../components/common/ScreenHeader";
import ProductForm from "../../../../components/admin/ProductForm";
import EmptyState from "../../../../components/common/EmptyState";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import { useProduct } from "../../../../hooks/useProducts";
import { updateProduct } from "../../../../services/products";
import { uploadProductImage, reclaimSupersededProductImages } from "../../../../services/storage";

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack("/(admin)");

export default function AdminEditProductScreen() {
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId as string;

  const { product, loading, error, reload } = useProduct(productId);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Edit product" subtitle="Update catalog item" onBack={onBack} />}>
        <LoadingState label="Loading product" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Edit product" subtitle="Update catalog item" onBack={onBack} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!product) {
    return (
      <Screen header={<ScreenHeader title="Edit product" subtitle="Update catalog item" onBack={onBack} />}>
        <EmptyState
          title="Product not found"
          message="This product may have been removed."
          actionLabel="Back to products"
          onAction={() => goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader title="Edit product" subtitle="Update catalog item" onBack={onBack} />}>
      <ProductForm
        key={product.id}
        product={product}
        onUploadImage={(localUri, slot, id) => uploadProductImage(localUri, id, slot)}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          const saved = await updateProduct(productId, input);

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
    </Screen>
  );
}
