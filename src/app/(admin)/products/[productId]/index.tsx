import { router, useLocalSearchParams } from "expo-router";
import { goBack } from '@/utils/navigation';
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../../components/admin/AdminHeader";
import Button from "../../../../components/common/Button";
import EmptyState from "../../../../components/common/EmptyState";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import Modal from "../../../../components/common/Modal";
import ResponsiveContainer from "../../../../components/common/ResponsiveContainer";
import StatusBadge from "../../../../components/common/StatusBadge";
import ProductImage from "../../../../components/products/ProductImage";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import { useShadows } from "../../../../constants/shadows";
import { useResponsive } from "../../../../hooks/useResponsive";
import { useProduct } from "../../../../hooks/useProducts";
import { updateProduct, deleteProduct } from "../../../../services/products";
import config from "../../../../constants/config";
import { radius } from "../../../../constants/sizes";
import spacing from "../../../../constants/spacing";
import typography from "../../../../constants/typography";
import { formatCurrency } from "../../../../utils/currency";
import { normalizeError } from "../../../../utils/errorHandling";

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useThemeColors> }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function AdminProductDetailScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  const { isDesktop } = useResponsive();
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId as string;
  const { product, loading, error, reload } = useProduct(productId);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Product" subtitle="Product overview" />
        <LoadingState label="Loading product" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Product" subtitle="Product overview" />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Product" subtitle="Product overview" />
        <EmptyState
          title="Product not found"
          message="This product may have been removed."
          actionLabel="Back to products"
          onAction={() => goBack()}
        />
      </SafeAreaView>
    );
  }

  // The product row already carries the joined names, so this screen does not
  // have to load the whole category and manufacturer tables to label one row.
  const categoryName = product.categoryName ?? "";
  const manufacturerName = product.manufacturerName ?? "";

  const handleToggleActive = async () => {
    setUpdating(true);
    setActionError(null);
    try {
      await updateProduct(product.id, { isActive: !product.isActive });
      await reload();
    } catch (e) {
      setActionError(normalizeError(e).message);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteProduct(product.id);
      setDeleteConfirm(false);
      router.replace("/(admin)/products");
    } catch (e) {
      setActionError(normalizeError(e).message);
      setDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title={product?.name ?? "Product"} subtitle="Product overview" />

      <ScrollView contentContainerStyle={styles.container}>
        <ResponsiveContainer sidebarAware maxWidth={isDesktop ? 960 : 1320}>
          <View style={[styles.imageIsland, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm }]}>
            <ProductImage uri={product.image} recyclingKey={product.id} style={isDesktop ? styles.imageDesktop : styles.image} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm }]}>
          <Text style={[styles.brand, { color: colors.textMuted }]}>{product.brand}</Text>
          <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
          <Text style={[styles.generic, { color: colors.textMuted }]}>{product.genericName}</Text>

          <View style={styles.badges}>
            <StatusBadge label={product.isActive ? "Active" : "Inactive"} tone={product.isActive ? "info" : "neutral"} />
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
            <Text style={[styles.price, { color: colors.text }]}>{formatCurrency(product.price)}</Text>
            {product.originalPrice && product.originalPrice > product.price ? (
              <Text style={[styles.original, { color: colors.textMuted }]}>
                {formatCurrency(product.originalPrice)}
              </Text>
            ) : null}
            {product.discountPercent ? (
              <StatusBadge label={`-${product.discountPercent}%`} tone="warning" />
            ) : null}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

          <InfoRow label="Category" value={categoryName} colors={colors} />
          <InfoRow label="Manufacturer" value={manufacturerName} colors={colors} />
          <InfoRow label="Unit" value={product.unit} colors={colors} />
          <InfoRow label="Stock" value={`${product.stock} units`} colors={colors} />
          <InfoRow label="Batch number" value={product.batchNumber ?? ""} colors={colors} />
          <InfoRow
            label="Expiry date"
            value={
              product.expiryDate
                ? new Date(product.expiryDate).toLocaleDateString()
                : ""
            }
            colors={colors}
          />
          <InfoRow label="Featured" value={product.isFeatured ? "Yes" : "No"} colors={colors} />

          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

          <Text style={[styles.description, { color: colors.textMuted }]}>{product.description}</Text>
        </View>

        {actionError ? <Text style={{ color: colors.danger, fontSize: 12, textAlign: 'center' }}>{actionError}</Text> : null}

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
            onPress={handleToggleActive}
            loading={updating}
            disabled={updating || deleting}
            fullWidth
          />
          <Button
            title="Delete product"
            variant="danger"
            onPress={() => setDeleteConfirm(true)}
            disabled={updating || deleting}
            fullWidth
          />
        </View>
        </ResponsiveContainer>
      </ScrollView>

      <Modal
        visible={deleteConfirm}
        title="Delete product?"
        message={`"${product?.name ?? "This product"}" will be permanently removed from the catalog.`}
        actionLabel={deleting ? "Deleting..." : "Delete product"}
        onAction={handleDelete}
        onClose={() => setDeleteConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  imageIsland: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    padding: spacing.sm,
  },
  image: { height: 180, borderRadius: radius.lg },
  imageDesktop: { height: 280, borderRadius: radius.lg },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  brand: {
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  name: { fontSize: typography.h2, fontWeight: "700" },
  generic: { fontSize: typography.bodySmall },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  price: { fontSize: typography.h3, fontWeight: "800" },
  original: {
    fontSize: typography.caption,
    textDecorationLine: "line-through",
  },
  divider: { height: 1, marginVertical: spacing.sm },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  infoLabel: { fontSize: typography.bodySmall },
  infoValue: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    flexShrink: 1,
  },
  description: { fontSize: typography.bodySmall, lineHeight: 20 },
  actions: { gap: spacing.md, marginTop: spacing.xs },
});
