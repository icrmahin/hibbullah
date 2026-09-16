import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../../components/admin/AdminHeader";
import Button from "../../../../components/common/Button";
import EmptyState from "../../../../components/common/EmptyState";
import ErrorState from "../../../../components/common/ErrorState";
import LoadingState from "../../../../components/common/LoadingState";
import Modal from "../../../../components/common/Modal";
import StatusBadge from "../../../../components/common/StatusBadge";
import ProductImage from "../../../../components/products/ProductImage";
import colors from "../../../../constants/colors";
import config from "../../../../constants/config";
import spacing from "../../../../constants/spacing";
import typography from "../../../../constants/typography";
import {
  deleteProduct,
  setProductActive,
} from "../../../../services/admin/adminProductService";
import { getCategories } from "../../../../services/categoryService";
import { getManufacturers } from "../../../../services/manufacturerService";
import { getProductById } from "../../../../services/productService";
import type { Category } from "../../../../types/category";
import type { Manufacturer } from "../../../../types/manufacturer";
import type { Product } from "../../../../types/product";
import { formatCurrency } from "../../../../utils/currency";
import { normalizeError } from "../../../../utils/errorHandling";

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function AdminProductDetailScreen() {
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId;

  const [product, setProduct] = useState<Product | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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
      const category = categoryList.find(
        (entry: Category) => entry.id === item.categoryId,
      );
      const manufacturer = manufacturerList.find(
        (entry: Manufacturer) => entry.id === item.manufacturerId,
      );
      setCategoryName(category?.name ?? "");
      setManufacturerName(manufacturer?.name ?? "");
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async () => {
    if (!product) return;
    setToggling(true);
    try {
      await setProductActive(product.id, !product.isActive);
      await load();
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProduct(productId);
      setDeleteConfirm(false);
      router.replace("/(admin)/products");
    } catch (err) {
      setError(normalizeError(err).message);
      setDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingState label="Loading product…" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader
        title={product?.name ?? "Product"}
        subtitle="Product overview"
      />

      {error ? (
        <ErrorState title="Could not load product" message={error} onRetry={load} />
      ) : !product ? (
        <EmptyState
          title="Product not found"
          message="This product may have been removed."
          actionLabel="Back to products"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <ProductImage
            uri={product.image}
            recyclingKey={product.id}
            style={styles.image}
          />

          <View style={styles.card}>
            <Text style={styles.brand}>{product.brand}</Text>
            <Text style={styles.name}>{product.name}</Text>
            <Text style={styles.generic}>{product.genericName}</Text>

            <View style={styles.badges}>
              <StatusBadge
                label={product.isActive ? "Active" : "Inactive"}
                tone={product.isActive ? "info" : "neutral"}
              />
              <StatusBadge
                label={
                  product.stock === 0
                    ? "Out of stock"
                    : product.stock < config.lowStockThreshold
                      ? "Low stock"
                      : "In stock"
                }
                tone={
                  product.stock === 0
                    ? "danger"
                    : product.stock < config.lowStockThreshold
                      ? "warning"
                      : "success"
                }
              />
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatCurrency(product.price)}</Text>
              {product.originalPrice && product.originalPrice > product.price ? (
                <Text style={styles.original}>
                  {formatCurrency(product.originalPrice)}
                </Text>
              ) : null}
              {product.discountPercent ? (
                <StatusBadge label={`-${product.discountPercent}%`} tone="warning" />
              ) : null}
            </View>

            <View style={styles.divider} />

            <InfoRow label="Category" value={categoryName} />
            <InfoRow label="Manufacturer" value={manufacturerName} />
            <InfoRow label="Unit" value={product.unit} />
            <InfoRow label="Stock" value={`${product.stock} units`} />
            <InfoRow label="Batch number" value={product.batchNumber ?? ""} />
            <InfoRow
              label="Expiry date"
              value={
                product.expiryDate
                  ? new Date(product.expiryDate).toLocaleDateString()
                  : ""
              }
            />
            <InfoRow label="Featured" value={product.isFeatured ? "Yes" : "No"} />

            <View style={styles.divider} />

            <Text style={styles.description}>{product.description}</Text>
          </View>

          <View style={styles.actions}>
            <Button
              title="Edit product"
              onPress={() =>
                router.push({
                  pathname: "/(admin)/products/[productId]/edit",
                  params: { productId: product.id },
                })
              }
              fullWidth
            />
            <Button
              title={product.isActive ? "Deactivate" : "Activate"}
              variant={product.isActive ? "secondary" : "primary"}
              loading={toggling}
              onPress={handleToggleActive}
              fullWidth
            />
            <Button
              title="Delete product"
              variant="danger"
              onPress={() => setDeleteConfirm(true)}
              fullWidth
            />
          </View>
        </ScrollView>
      )}

      <Modal
        visible={deleteConfirm}
        title="Delete product?"
        message={`"${product?.name ?? "This product"}" will be permanently removed from the catalog.`}
        actionLabel={deleting ? "Deleting…" : "Delete product"}
        onAction={handleDelete}
        onClose={() => setDeleteConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    alignSelf: "center",
    width: "100%",
    maxWidth: 720,
  },
  image: { height: 180, borderRadius: 12 },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  brand: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  name: { color: colors.text, fontSize: typography.h2, fontWeight: "700" },
  generic: { color: colors.textMuted, fontSize: typography.bodySmall },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  price: { color: colors.text, fontSize: typography.h3, fontWeight: "800" },
  original: {
    color: colors.textMuted,
    fontSize: typography.caption,
    textDecorationLine: "line-through",
  },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.sm },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  infoLabel: { color: colors.textMuted, fontSize: typography.bodySmall },
  infoValue: {
    color: colors.text,
    fontSize: typography.bodySmall,
    fontWeight: "600",
    flexShrink: 1,
  },
  description: { color: colors.textMuted, fontSize: typography.bodySmall, lineHeight: 20 },
  actions: { gap: spacing.md, marginTop: spacing.xs },
});