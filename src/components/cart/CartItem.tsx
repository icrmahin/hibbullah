import { Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import type { CartItem } from "../../types/cart";
import { formatCurrency } from "../../utils/currency";
import ProductImage from "../products/ProductImage";
import QuantitySelector from "./QuantitySelector";

export default function CartItemRow({
  item,
  onQuantity,
  onRemove,
}: {
  item: CartItem;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.row}>
      <ProductImage
        uri={item.product.image}
        recyclingKey={item.id}
        style={styles.image}
      />
      <View style={styles.info}>
        <Text style={styles.name}>{item.product.name}</Text>
        <Text style={styles.meta}>{formatCurrency(item.product.price)}</Text>
        <QuantitySelector
          value={item.quantity}
          onChange={onQuantity}
          max={item.product.stock}
        />
      </View>
      <View style={styles.aside}>
        <Text style={styles.price}>
          {formatCurrency(item.product.price * item.quantity)}
        </Text>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.product.name} from cart`}
        >
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.backgroundAlt,
    borderRadius: sizes.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  image: { width: sizes.thumbnail, height: sizes.thumbnail, borderRadius: sizes.borderRadius.md },
  info: { flex: 1, gap: spacing.xxs },
  name: { color: colors.text, fontSize: typography.subhead, fontWeight: "600" },
  meta: { color: colors.textMuted, fontSize: typography.caption1 },
  aside: { alignItems: "flex-end", justifyContent: "space-between" },
  price: { color: colors.text, fontSize: typography.subhead, fontWeight: "600" },
  remove: {
    color: colors.danger,
    fontSize: typography.caption2,
    fontWeight: "600",
  },
});
