import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import type { CartItem } from "../../types/cart";
import { formatCurrency } from "../../utils/currency";
import ProductImage from "../products/ProductImage";
import QuantitySelector from "./QuantitySelector";

export default function CartItemRow({
  item,
  onQuantity,
  onRemove,
  isLast = false,
}: {
  item: CartItem;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  const original = item.product.originalPrice;
  const showsOriginal = original != null && original > item.product.price;

  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
      ]}
    >
      <ProductImage uri={item.product.image} recyclingKey={item.id} style={styles.image} />
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {item.product.name}
        </Text>
        <Text style={[styles.unit, { color: colors.textMuted }]} numberOfLines={1}>
          {formatCurrency(item.product.price)} each
          {showsOriginal ? (
            <Text style={[styles.original, { color: colors.textMuted }]}>
              {"  "}
              {formatCurrency(original)}
            </Text>
          ) : null}
        </Text>
        <View style={styles.stepper}>
          <QuantitySelector value={item.quantity} onChange={onQuantity} max={item.product.stock} />
        </View>
      </View>
      <View style={styles.aside}>
        <Text style={[styles.total, { color: colors.text }]} numberOfLines={1}>
          {formatCurrency(item.product.price * item.quantity)}
        </Text>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          android_ripple={{ color: colors.ripple.neutral, borderless: false }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.product.name} from cart`}
        >
          <Text style={[styles.remove, { color: colors.textMuted }]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
    alignItems: "flex-start",
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  info: {
    flex: 1,
    gap: spacing.xxs,
    paddingTop: 2,
  },
  name: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  unit: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  original: {
    fontSize: fontSize.tiny,
    textDecorationLine: "line-through",
  },
  stepper: {
    marginTop: spacing.xs,
  },
  aside: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingTop: 2,
    paddingBottom: 2,
  },
  total: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.tight,
  },
  remove: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    paddingVertical: spacing.xxs,
  },
});
