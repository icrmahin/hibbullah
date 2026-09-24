import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import { formatCurrency } from "../../utils/currency";

export default function ProductPrice({
  price,
  originalPrice,
}: {
  price: number;
  originalPrice?: number;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row} accessibilityLabel={`Price ${formatCurrency(price)}`}>
      <Text style={[styles.price, { color: colors.text }]}>{formatCurrency(price)}</Text>
      {originalPrice && originalPrice > price ? (
        <Text style={[styles.original, { color: colors.textMuted }]}>{formatCurrency(originalPrice)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  price: { fontSize: typography.headline, fontWeight: "600" },
  original: {
    fontSize: typography.caption1,
    textDecorationLine: "line-through",
  },
});