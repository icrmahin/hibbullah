import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize } from "../../constants/typography";
import type { Order } from "../../types/order";
import { formatCurrency } from "../../utils/currency";
import { formatDate } from "../../utils/date";
import OrderStatus from "./OrderStatus";
import Icon from "../common/Icon";

type OrderCardProps = {
  order: Order;
  onPress?: (order: Order) => void;
};

export default function OrderCard({ order, onPress }: OrderCardProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const isPending = order.status === "PENDING";
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.borderSoft,
          ...shadows.xs,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
      onPress={() => onPress?.(order)}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderNumber}, ${order.status}, ${formatCurrency(order.total)}`}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.orderNumber, { color: colors.text }]}>{order.orderNumber}</Text>
        <OrderStatus status={order.status} />
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{formatDate(order.createdAt)}</Text>
        <View style={[styles.dot, { backgroundColor: colors.border }]} />
        <Text style={[styles.meta, { color: colors.textMuted }]}>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</Text>
        <View style={[styles.dot, { backgroundColor: colors.border }]} />
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {order.paymentMethod === "CASH_ON_DELIVERY" ? "COD" : order.paymentMethod}
        </Text>
      </View>

      {/* Timeline dot preview — 3 steps */}
      <View style={styles.timelinePreview}>
        <View style={[styles.tlDot, { backgroundColor: colors.primary }]} />
        <View style={[styles.tlLine, { backgroundColor: colors.borderLight }]} />
        <View style={[styles.tlDot, { backgroundColor: isPending ? colors.borderLight : colors.primary }]} />
        <View style={[styles.tlLine, { backgroundColor: colors.borderLight }]} />
        <View style={[styles.tlDot, { backgroundColor: order.status === "DELIVERED" ? colors.success : colors.borderLight }]} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.total, { color: colors.text }]}>{formatCurrency(order.total)}</Text>
        <View style={[styles.chevronPill, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  orderNumber: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.subhead,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
  },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  timelinePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tlDot: { width: 6, height: 6, borderRadius: 3 },
  tlLine: { flex: 1, height: 1, maxWidth: 24 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "transparent",
  },
  total: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.body,
  },
  chevronPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
