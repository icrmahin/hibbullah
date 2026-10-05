import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import type { Product } from "../../types/product";
import config from "../../constants/config";
import ProductImage from "../products/ProductImage";
import ProductPrice from "../products/ProductPrice";
import StatusBadge from "../common/StatusBadge";
import { statusTone } from "../../utils/statusTone";

export default function AdminProductCard({
  product,
  onPress,
}: {
  product: Product;
  onPress?: (product: Product) => void;
}) {
  const colors = useThemeColors();
  // Same threshold as the product detail screen (`config.lowStockThreshold`) — two
  // screens disagreeing about what "low" means is a data bug wearing a UI costume.
  const stockKey = !product.isActive ? "INACTIVE" : product.stock === 0 ? "OUT_OF_STOCK" : product.stock < config.lowStockThreshold ? "LOW" : "ACTIVE";

  return (
    <Pressable
      android_ripple={{ color: colors.ripple.primary, borderless: false }}
      style={[
        styles.card,
        { backgroundColor: colors.backgroundAlt },
      ]}
      onPress={() => onPress?.(product)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${product.name}`}
    >
      <View style={{ padding: spacing.sm }}>
        <ProductImage
          uri={product.primaryImage ?? product.image}
          recyclingKey={product.id}
          style={styles.image}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {product.name}
          </Text>
          <StatusBadge
            label={
              !product.isActive
                ? "Inactive"
                : product.stock === 0
                  ? "Out of stock"
                  : product.stock < config.lowStockThreshold
                    ? "Low stock"
                    : "Active"
            }
            tone={statusTone(stockKey)}
          />
        </View>
        {/* The generic-name field is gone from the form, so it can be empty on any medicine
            saved after that. A separator in front of nothing is not a shorter line, it is a
            dangling "·" — so the half that exists is what is drawn. */}
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {product.genericName ? `${product.brand} · ${product.genericName}` : product.brand}
        </Text>
        <View style={styles.footer}>
          <ProductPrice price={product.price} originalPrice={product.originalPrice} />
          {/* Neutral ink: the badge above already carries the stock status, so
              colouring the count too would signal by colour alone. */}
          <Text
            style={[
              styles.stock,
              { color: colors.textMuted },
            ]}
          >
            {product.stock} units
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: radius.lg,
    overflow: "hidden",
    alignItems: "center",
  },
  image: { width: 88, height: 88, borderRadius: radius.lg },
  content: { flex: 1, padding: spacing.md, gap: spacing.xs },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  stock: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
});
