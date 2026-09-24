/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { goBack } from "@/utils/navigation";
import { router } from "expo-router";
import { useState, useEffect } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";
import Button from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import LoadingState from "../../components/common/LoadingState";
import ResponsiveContainer from "../../components/common/ResponsiveContainer";
import spacing from "../../constants/spacing";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../hooks/useAuth";
import { useCart } from "../../providers/CartProvider";
import { useAddresses } from "../../hooks/useAddresses";
import { useCreateOrder } from "../../hooks/useOrders";
import { formatCurrency } from "../../utils/currency";
import { normalizeError } from "../../utils/errorHandling";
import Icon from "../../components/common/Icon";

export default function CheckoutScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, summary, loading: cartLoading } = useCart();
  const { user, isAdmin } = useAuth();
  const { data: addresses, loading: addressesLoading, remove: removeAddress } = useAddresses();
  const { create: createOrder } = useCreateOrder();
  const { isDesktop } = useResponsive();

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];
      setSelectedAddressId(defaultAddress.id);
    }
  }, [addresses, selectedAddressId]);

  const handleSubmit = async () => {
    if (!items.length || submitting || !selectedAddressId) return;
    if (!isAdmin) {
      const phone = user?.phone || "";
      if (!phone || !/^\+?8801[0-9]{9}$/.test(phone)) {
        setError("Please add your Bangladeshi phone (+8801XXXXXXXXX) in Account → Profile before ordering.");
        return;
      }
    }
    if (!selectedAddressId) {
      setError("Please select or add a delivery address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createOrder(selectedAddressId);
      setSuccess(true);
    } catch (nextError) {
      setError(normalizeError(nextError).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAddress = (id: string) => {
    Alert.alert("Delete address", "Remove this saved location?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await removeAddress(id);
            if (selectedAddressId === id) setSelectedAddressId(addresses.find((a) => a.id !== id)?.id ?? null);
          } catch (e) {
            setError(normalizeError(e).message);
          }
        },
      },
    ]);
  };

  if (cartLoading || addressesLoading) return <LoadingState label="Loading checkout" />;
  if (!items.length) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top + spacing.md }]}>
        <Pressable
          style={[styles.floatingBack, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}
          onPress={() => goBack()}
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-back" size={18} color={colors.text} />
        </Pressable>
        <EmptyState title="Your cart is empty" message="Add a medicine before checking out." actionLabel="Browse products" onAction={() => router.replace("/(customer)/(tabs)/products")} />
      </View>
    );
  }

  const addressSection = (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Delivery Address</Text>
      <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Choose where to deliver · swipe delete to remove</Text>
      <View style={styles.addressList}>
        {addresses.map((addr) => {
          const active = selectedAddressId === addr.id;
          return (
            <Pressable
              key={addr.id}
              onPress={() => setSelectedAddressId(addr.id)}
              style={[
                styles.addressOption,
                active && styles.addressOptionSelected,
                { backgroundColor: active ? colors.primarySoft : colors.backgroundAlt, borderColor: active ? colors.primary : colors.borderLight },
              ]}
            >
              <View style={styles.addressOptionContent}>
                <Text style={[styles.addressLabel, { color: colors.text }]}>{addr.label}</Text>
                <Text style={[styles.addressDetail, { color: colors.textMuted }]} numberOfLines={2}>
                  {addr.street}, {addr.city}
                  {addr.county ? `, ${addr.county}` : ""}
                  {addr.postalCode ? ` · ${addr.postalCode}` : ""}
                </Text>
              </View>
              <View style={styles.addressActions}>
                {active && <Icon name="check-circle" size={18} color={colors.primary} />}
                <Pressable
                  onPress={() => handleDeleteAddress(addr.id)}
                  hitSlop={8}
                  style={[styles.deleteBtn, { backgroundColor: colors.danger + "12" }]}
                  accessibilityLabel={`Delete ${addr.label}`}
                >
                  <Icon name="delete-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </Pressable>
          );
        })}
        {addresses.length === 0 ? <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No saved addresses — add one below.</Text> : null}
      </View>
    </View>
  );

  const summaryBox = (
    <View style={[styles.summaryBox, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
      <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.sm }]}>Order summary</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
            {item.product.name}
          </Text>
          <Text style={[styles.rowValue, { color: colors.textMuted }]}>
            {item.quantity} × {formatCurrency(item.product.price)}
          </Text>
        </View>
      ))}
      <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Subtotal</Text>
        <Text style={[styles.rowValue, { color: colors.text }]}>{formatCurrency(summary.subtotal)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Discount</Text>
        <Text style={[styles.rowValue, { color: colors.success }]}>-{formatCurrency(summary.discount)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Delivery</Text>
        <Text style={[styles.rowValue, { color: colors.text }]}>{formatCurrency(summary.deliveryFee)}</Text>
      </View>
      <View style={[styles.row, styles.totalRow, { borderTopColor: colors.borderLight }]}>
        <Text style={[styles.totalText, { color: colors.text }]}>Total</Text>
        <Text style={[styles.totalText, { color: colors.text }]}>{formatCurrency(summary.total)}</Text>
      </View>
    </View>
  );

  const paymentBox = (
    <View style={[styles.paymentBox, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment</Text>
      <Text style={[styles.paymentMethod, { color: colors.textMuted }]}>Cash on Delivery</Text>
    </View>
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Floating top-right go back — thumb reachable, no title bar */}
      <View style={[styles.floatingWrap, { top: insets.top + spacing.sm }]}>
        <Pressable
          style={[styles.floatingBack, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}
          onPress={() => goBack()}
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Icon name="arrow-back" size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 52, paddingBottom: Math.max(insets.bottom, spacing.lg) + 24 }]} showsVerticalScrollIndicator={false}>
        <ResponsiveContainer maxWidth={isDesktop ? 960 : 1320}>
          {isDesktop ? (
            <View style={styles.desktopLayout}>
              <View style={styles.formColumn}>
                {addressSection}
                {paymentBox}
              </View>
              <View style={styles.summaryColumn}>
                {summaryBox}
                {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
                {success ? <Text style={[styles.success, { color: colors.success }]}>Order submitted — view delivery cycle.</Text> : null}
                <View style={styles.bottomRow}>
                  <View style={{ flex: 1 }}>
                    <Button title="Add address" variant="secondary" onPress={() => router.push("/(customer)/address/edit")} fullWidth />
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Button
                      title={success ? "View cycle" : "Submit order"}
                      onPress={success ? () => router.replace("/(customer)/delivery-cycle") : handleSubmit}
                      loading={submitting}
                      disabled={success ? false : !selectedAddressId || submitting}
                      fullWidth
                    />
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mobileStack}>
              {addressSection}
              {summaryBox}
              {paymentBox}
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              {success ? <Text style={[styles.success, { color: colors.success }]}>Order submitted — view delivery cycle.</Text> : null}
              {/* Compact thumb-reachable row */}
              <View style={styles.bottomRow}>
                <View style={{ flex: 1 }}>
                  <Button title="Add address" variant="secondary" onPress={() => router.push("/(customer)/address/edit")} fullWidth />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Button
                    title={success ? "View cycle" : "Submit order"}
                    onPress={success ? () => router.replace("/(customer)/delivery-cycle") : handleSubmit}
                    loading={submitting}
                    disabled={success ? false : !selectedAddressId || submitting}
                    fullWidth
                  />
                </View>
              </View>
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  floatingWrap: { position: "absolute", right: 16, zIndex: 10 },
  floatingBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 4px rgba(0,0,0,0.08)",
  },
  container: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  desktopLayout: { flexDirection: "row", gap: spacing.xl },
  formColumn: { flex: 1, gap: spacing.lg },
  summaryColumn: { flex: 1, gap: spacing.lg },
  mobileStack: { gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { fontWeight: "700", fontSize: 14 },
  sectionHint: { fontSize: 11, marginTop: -4 },
  addressList: { gap: spacing.sm, marginTop: spacing.xs },
  addressOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
  },
  addressOptionSelected: { borderWidth: 2 },
  addressOptionContent: { flex: 1, gap: 2 },
  addressLabel: { fontWeight: "700", fontSize: 13 },
  addressDetail: { fontSize: 12, lineHeight: 16 },
  addressActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deleteBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  emptyHint: { fontSize: 12, paddingVertical: spacing.sm },
  summaryBox: { borderRadius: 16, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.xs },
  rowLabel: { fontSize: 12, flex: 1 },
  rowValue: { fontSize: 12, fontWeight: "600" },
  divider: { height: 1, marginVertical: spacing.sm },
  totalRow: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1 },
  totalText: { fontWeight: "800", fontSize: 14 },
  paymentBox: { borderRadius: 16, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  paymentMethod: { fontSize: 12, marginTop: 2 },
  error: { fontSize: 12, textAlign: "center" },
  success: { fontSize: 12, textAlign: "center" },
  bottomRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
