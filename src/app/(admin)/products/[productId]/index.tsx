import { router, useLocalSearchParams } from "expo-router";
import { goBack } from '@/utils/navigation';
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Screen from "../../../../components/common/Screen";
import ScreenHeader from "../../../../components/common/ScreenHeader";
import Button from "../../../../components/common/Button";
import EmptyState from "../../../../components/common/EmptyState";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import Modal from "../../../../components/common/Modal";
import ResponsiveContainer from "../../../../components/common/ResponsiveContainer";
import StatusBadge from "../../../../components/common/StatusBadge";
import ProductImage from "../../../../components/products/ProductImage";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import { useResponsive } from "../../../../hooks/useResponsive";
import { useBottomInset } from "../../../../hooks/useBottomInset";
import { useProduct } from "../../../../hooks/useProducts";
import { fetchProductInventory, updateProduct, deleteProduct } from "../../../../services/products";
import config from "../../../../constants/config";
import { radius } from "../../../../constants/sizes";
import { spacing } from "../../../../constants/spacing";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../../../constants/typography";
import { formatDate } from "../../../../utils/date";
import { formatCurrency } from "../../../../utils/currency";
import { normalizeError } from "../../../../utils/errorHandling";
import { statusTone } from "../../../../utils/statusTone";

/** One level deep: the catalog, when there is nothing to pop. */
const onBack = () => goBack("/(admin)");

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
  const bottomInset = useBottomInset();
  const { isDesktop } = useResponsive();
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId as string;
  const { product, loading, error, reload } = useProduct(productId);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Batch numbers and expiry dates belong to a stock batch, not to the product row: the
  // `products` table has no such columns, which is why the two rows at the bottom of this
  // card had come back empty all along even though `create_product` writes a batch number
  // on every creation. This is the client-side interface that number was missing — read
  // from `inventory_items`, so what is drawn is the same identifier the picker reads off
  // the box, with nothing regenerated on this side.
  const [inventory, setInventory] = useState<
    { batchNumber: string; expiryDate?: string }[]
  >([]);
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetchProductInventory(productId)
      .then((rows) => {
        if (!cancelled) setInventory(rows);
      })
      .catch(() => {
        // No batches yet (a product whose stock was never distributed) is not an error the
        // owner needs to hear about: the rows simply do not render.
        if (!cancelled) setInventory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Product" subtitle="Product overview" onBack={onBack} />}>
        <LoadingState label="Loading product" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Product" subtitle="Product overview" onBack={onBack} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!product) {
    return (
      <Screen header={<ScreenHeader title="Product" subtitle="Product overview" onBack={onBack} />}>
        <EmptyState
          title="Product not found"
          message="This product may have been removed."
          actionLabel="Back to products"
          onAction={() => goBack()}
        />
      </Screen>
    );
  }

  // The product row already carries the joined names, so this screen does not
  // have to load the whole category and manufacturer tables to label one row.
  const categoryName = product.categoryName ?? "";
  const manufacturerName = product.manufacturerName ?? "";
  // Every batch the product has, in the order `fetchProductInventory` returns them, and
  // the earliest date any of them carries. An empty product has neither, so both render
  // as nothing rather than as an empty row.
  const batchNumbers = inventory.map((b) => b.batchNumber).filter(Boolean).join(", ");
  const earliestExpiry = inventory.find((b) => b.expiryDate)?.expiryDate ?? "";

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
    <Screen header={<ScreenHeader title={product?.name ?? "Product"} subtitle="Product overview" onBack={onBack} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <ResponsiveContainer sidebarAware maxWidth={isDesktop ? 960 : 1320}>
          <View style={[styles.imageIsland, { backgroundColor: colors.backgroundAlt }]}>
            <ProductImage uri={product.image} recyclingKey={product.id} style={isDesktop ? styles.imageDesktop : styles.image} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.brand, { color: colors.textMuted }]}>{product.brand}</Text>
          <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
          {/* Empty for any medicine saved after the "same medicine, any brand" box was
              removed — an empty line is the honest rendering, a blank one is a gap in
              the layout. */}
          {product.genericName ? (
            <Text style={[styles.generic, { color: colors.textMuted }]}>{product.genericName}</Text>
          ) : null}

          <View style={styles.badges}>
            <StatusBadge label={product.isActive ? "Active" : "Inactive"} tone={statusTone(product.isActive ? "ACTIVE" : "INACTIVE")} />
            <StatusBadge
              label={
                product.stock === 0
                  ? "Out of stock"
                  : product.stock < config.lowStockThreshold
                    ? "Low stock"
                    : "In stock"
              }
              tone={statusTone(
                product.stock === 0
                  ? "OUT_OF_STOCK"
                  : product.stock < config.lowStockThreshold
                    ? "LOW"
                    : "ACTIVE",
              )}
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

          <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />

          <InfoRow label="Category" value={categoryName} colors={colors} />
          <InfoRow label="Manufacturer" value={manufacturerName} colors={colors} />
          <InfoRow label="Unit" value={product.unit} colors={colors} />
          <InfoRow label="Stock" value={`${product.stock} units`} colors={colors} />
          {/* Generated by the backend when the product was created, never typed in — this
              row is where it becomes visible. `InfoRow` returns null on an empty value, so
              a product with no batches yet simply has no row. */}
          <InfoRow label="Batch number" value={batchNumbers} colors={colors} />
          <InfoRow
            label="Expiry date"
            value={earliestExpiry ? formatDate(earliestExpiry) : ""}
            colors={colors}
          />
          <InfoRow label="Featured" value={product.isFeatured ? "Yes" : "No"} colors={colors} />

          <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />

          <Text style={[styles.description, { color: colors.textMuted }]}>{product.description}</Text>
        </View>

        {actionError ? (
          <Text style={[styles.actionError, { color: colors.danger }]}>{actionError}</Text>
        ) : null}

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
        message={`"${product?.name ?? "This product"}" will be removed from the catalog. If it has order history, the orders are kept but the product stays hidden.`}
        actionLabel={deleting ? "Deleting..." : "Delete product"}
        onAction={handleDelete}
        onClose={() => setDeleteConfirm(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ResponsiveContainer below owns the horizontal gutter, so this holds only the
  // vertical rhythm and the bottom inset.
  container: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  imageIsland: {
    borderRadius: radius.lg,
    overflow: "hidden",
    padding: spacing.sm,
  },
  image: { height: 180, borderRadius: radius.lg },
  imageDesktop: { height: 280, borderRadius: radius.lg },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  brand: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  },
  name: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  generic: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  price: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.title3,
    lineHeight: fontSize.title3 * lineHeight.tight,
  },
  original: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textDecorationLine: "line-through",
  },
  divider: { height: 1, marginVertical: spacing.sm },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  infoLabel: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  infoValue: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    flexShrink: 1,
  },
  description: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  actionError: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  actions: { gap: spacing.md, marginTop: spacing.xs },
});
