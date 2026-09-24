import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
// FIX: aliased the CartSummary type import — it collided with the default-export component
// named CartSummary below, which caused an ESLint no-redeclare error and shadowed the type.
import type { CartSummary as CartSummaryData } from "../../types/cart";
import { formatCurrency } from "../../utils/currency";

export default function CartSummary({ summary }: { summary: CartSummaryData }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.box, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
      <Row label="Subtotal" value={formatCurrency(summary.subtotal)} colors={colors} />
      <Row label="Discount" value={`-${formatCurrency(summary.discount)}`} colors={colors} />
      <Row label="Delivery" value={formatCurrency(summary.deliveryFee)} colors={colors} />
      <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.total, { color: colors.text }]}>Total</Text>
        <Text style={[styles.total, { color: colors.text }]}>{formatCurrency(summary.total)}</Text>
      </View>
    </View>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: { textMuted: string; text: string } }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: sizes.cardRadius,
    borderWidth: 1,
    padding: spacing.lg,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  label: { fontSize: typography.caption },
  value: { fontSize: typography.caption },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  total: { fontWeight: "700" },
});