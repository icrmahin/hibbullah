import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import type { CartSummary as CartSummaryData } from "../../types/cart";
import { formatCurrency } from "../../utils/currency";

/**
 * The money block: subtotal, discount, delivery, total.
 *
 * One card, hairline above the total, PJS throughout. Cart and checkout both render this
 * rather than each writing their own copy of the four rows — the rows are the same
 * arithmetic wearing different surroundings, and they drifted apart when they were
 * hand-written twice in one file.
 */
export default function CartSummary({ summary }: { summary: CartSummaryData }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.box, { backgroundColor: colors.backgroundAlt }]}>
      <Row label="Subtotal" value={formatCurrency(summary.subtotal)} muted />
      <Row label="Discount" value={`-${formatCurrency(summary.discount)}`} muted />
      <Row label="Delivery" value={formatCurrency(summary.deliveryFee)} muted />
      <View style={[styles.totalRow, { borderTopColor: colors.borderSoft }]}>
        <Text style={[styles.total, { color: colors.text }]}>Total</Text>
        <Text style={[styles.total, { color: colors.text }]}>{formatCurrency(summary.total)}</Text>
      </View>
    </View>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: muted ? colors.textMuted : colors.text }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  value: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  total: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.title3,
    lineHeight: fontSize.title3 * lineHeight.tight,
    letterSpacing: -0.2,
  },
});
