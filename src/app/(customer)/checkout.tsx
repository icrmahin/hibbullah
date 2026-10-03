/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { goBack } from "@/utils/navigation";
import { router } from "expo-router";
import { useState, useEffect } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import Screen from "../../components/common/Screen";
import ScreenHeader from "../../components/common/ScreenHeader";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import EmptyState from "../../components/common/EmptyState";
import LoadingState from "../../components/common/LoadingState";
import ResponsiveContainer from "../../components/common/ResponsiveContainer";
import CartSummary from "../../components/cart/CartSummary";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius } from "../../constants/sizes";
import { useResponsive } from "../../hooks/useResponsive";
import { useBottomInset } from "../../hooks/useBottomInset";
import { useAuth } from "../../hooks/useAuth";
import { useCart } from "../../providers/CartProvider";
import { useAddresses } from "../../hooks/useAddresses";
import { useCreateOrder } from "../../hooks/useOrders";
import { useConfirm } from "../../hooks/useConfirm";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { formatCurrency } from "../../utils/currency";
import { deliveryFeeForDistrict } from "../../utils/deliveryFee";
import { normalizeError } from "../../utils/errorHandling";
import Icon from "../../components/common/Icon";

export default function CheckoutScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { items, summary, loading: cartLoading, reload: reloadCart } = useCart();
  const { user, isAdmin } = useAuth();
  const { data: addresses, loading: addressesLoading, remove: removeAddress } = useAddresses();
  const { create: createOrder } = useCreateOrder();
  const { isDesktop } = useResponsive();

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { confirm, confirmDialogProps } = useConfirm();

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];
      setSelectedAddressId(defaultAddress.id);
    }
  }, [addresses, selectedAddressId]);

  // Declared before `handleSubmit` reads it: the contact check and the fee below are both
  // about the address the customer picked, and there is only one of it.
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;

  const handleSubmit = async () => {
    // `!selectedAddressId` used to be part of this guard. That made the address check
    // below unreachable, and because the Submit button was also disabled on the same
    // condition, tapping it did nothing at all -- no order, no message, no error. The
    // button is now always pressable while not submitting, and pressing it is what
    // surfaces the reason.
    if (!items.length || submitting) return;

    setError(null);

    // Checked before the phone, because a missing address is the far more common reason
    // and the database now refuses one outright rather than storing an empty string.
    if (!selectedAddressId) {
      setError(
        addresses.length === 0
          ? "Add a delivery address to place this order. We need somewhere to send it."
          : "Choose a delivery address for this order."
      );
      return;
    }

    if (!isAdmin) {
      // The address now carries its own mobile — the number the customer typed for THIS
      // delivery — so it satisfies the contact requirement by itself. Requiring the
      // profile number too would send someone who gave us a number in the very form this
      // order is about away to Account → Profile first.
      const phone = user?.phone || selectedAddress?.phone || "";
      if (!phone || !/^\+8801[0-9]{9}$/.test(phone)) {
        setError("Please add a Bangladeshi phone (+8801XXXXXXXXX) — in this address or your profile — before ordering.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await createOrder(selectedAddressId, orderNote);
      setSuccess(true);
      // create_order deletes the cart server-side, so the local copy is now stale and the
      // cart badge would keep counting items the customer has already bought. Without
      // this the count only corrects itself on a full app restart.
      await reloadCart();
    } catch (nextError) {
      setError(normalizeError(nextError).message);
    } finally {
      setSubmitting(false);
    }
  };

  // The bin icon. This used to be `Alert.alert(..., [{ onPress: async () => { await
  // removeAddress(id) } }])`, which is why deleting an address did nothing on web:
  // react-native-web's Alert is `static alert() {}`, so the onPress never ran. The DELETE
  // itself was always fine — verified against the live project through the exact request
  // this service sends, 7/7, so nothing about RLS or grants was wrong.
  const handleDeleteAddress = async (id: string) => {
    setError(null);
    const target = addresses.find((a) => a.id === id);
    const ok = await confirm({
      title: "Delete address",
      message: target
        ? `Remove "${target.label}" — ${[target.street, target.city].filter(Boolean).join(", ")}?`
        : "Remove this saved location?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeAddress(id);
      // Clearing the selection rather than picking a replacement from the local array:
      // that array is the render-time copy, so the row it offers is not necessarily in
      // the list `removeAddress` just reloaded. Setting null hands the choice back to the
      // auto-select effect above, which reads the fresh list and picks the new default.
      if (selectedAddressId === id) setSelectedAddressId(null);
    } catch (e) {
      setError(normalizeError(e).message);
    }
  };

  // The confirm dialog is mounted in these early-return branches too, not just the main
  // tree. `removeAddress` sets `addressesLoading` for the length of its reload, so without
  // this the dialog would be torn out of the tree and reappear once loading finished —
  // a confirmation flashing away and coming back is worse than no animation at all.
  if (cartLoading || addressesLoading) {
    return (
      <Screen header={<ScreenHeader title="Checkout" onBack={() => goBack()} />}>
        <LoadingState label="Loading checkout" />
        <ConfirmDialog {...confirmDialogProps} />
      </Screen>
    );
  }
  if (!items.length) {
    return (
      <Screen header={<ScreenHeader title="Checkout" onBack={() => goBack()} />}>
        <EmptyState title="Your cart is empty" message="Add a medicine before checking out." actionLabel="Browse products" onAction={() => router.replace("/(customer)/(tabs)/products")} />
        <ConfirmDialog {...confirmDialogProps} />
      </Screen>
    );
  }

  const addressSection = (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Delivery Address</Text>
      <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Choose where to deliver · tap the bin to remove one</Text>
      <View style={styles.addressList}>
        {addresses.map((addr) => {
          const active = selectedAddressId === addr.id;
          return (
            <Pressable
              key={addr.id}
              onPress={() => setSelectedAddressId(addr.id)}
              style={[
                styles.addressOption,
                { backgroundColor: active ? colors.primarySoft : colors.backgroundAlt, borderColor: active ? colors.accent : colors.borderLight },
              ]}
            >
              <View style={styles.addressOptionContent}>
                <Text style={[styles.addressLabel, { color: colors.text }]}>{addr.label}</Text>
                {/* The city is optional now — a new-form address keeps its whole
                    location in `street` — so it is only joined in when present, and the
                    mobile rides along on the same line where the customer can see which
                    number we'll call. */}
                <Text style={[styles.addressDetail, { color: colors.textMuted }]} numberOfLines={2}>
                  {[addr.street, addr.city].filter(Boolean).join(", ")}
                  {addr.county ? `, ${addr.county}` : ""}
                  {addr.postalCode ? ` · ${addr.postalCode}` : ""}
                  {addr.phone ? ` · ${addr.phone}` : ""}
                </Text>
              </View>
              <View style={styles.addressActions}>
                {active && <Icon name="check-circle" size={18} color={colors.accent} />}
                <Pressable
                  onPress={() => handleDeleteAddress(addr.id)}
                  hitSlop={8}
                  style={[styles.deleteBtn, { backgroundColor: colors.dangerSoft }]}
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
      {/* Shown before the button is pressed, not only after. A disabled button with no
          visible reason is indistinguishable from a broken one, which is exactly what was
          reported. */}
      {!selectedAddressId && !success ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
          ]}
          accessibilityRole="alert"
        >
          <Icon name="error-outline" size={16} color={colors.warning} />
          <Text style={[styles.noticeText, { color: colors.text }]}>
            {addresses.length === 0
              ? "No delivery address yet. Add one to place this order."
              : "Select a delivery address to place this order."}
          </Text>
        </View>
      ) : null}
    </View>
  );

  // The total the customer is actually quoted, priced from the address they picked.
  //
  // The provider's own summary carries the cheapest rate, because the cart page has no
  // address to price from and must not invent a Dhaka assumption. Reusing it here would
  // therefore underquote every outside-Dhaka order by 70 taka, and the customer would only
  // find out when the order landed — a total that silently changes is the single most
  // trust-destroying thing a checkout can do. `create_order` computes the same figure from
  // the same district and writes it onto the order row, so what is shown here is what gets
  // charged; verify:sql-sync fails if the two implementations of the rule ever drift.
  // The customer picked address — one value, read by the contact check above and the fee
  // below.
  const deliveryFee = deliveryFeeForDistrict(selectedAddress?.county);
  const pricedSummary = {
    ...summary,
    deliveryFee,
    total: summary.subtotal - summary.discount + deliveryFee,
  };

  const summaryBox = (
    <View style={[styles.summaryBox, { backgroundColor: colors.backgroundAlt }]}>
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
      {selectedAddress?.county ? (
        <Text style={[styles.feeNote, { color: colors.textMuted }]}>
          {deliveryFeeForDistrict(selectedAddress.county) === deliveryFee
            ? `${selectedAddress.county} District — reduced rate`
            : `${selectedAddress.county} District — standard rate`}
        </Text>
      ) : null}
    </View>
  );

  // The four money rows are the shared `CartSummary`, not a second copy of them: same
  // arithmetic, same hairline above the total, and no way for the two to drift apart.
  const summaryGroup = (
    <View style={styles.summaryGroup}>
      {summaryBox}
      <CartSummary summary={pricedSummary} />
    </View>
  );

  const paymentBox = (
    <View style={[styles.paymentBox, { backgroundColor: colors.backgroundAlt }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment</Text>
      <Text style={[styles.paymentMethod, { color: colors.textMuted }]}>Cash on Delivery</Text>
    </View>
  );

  // Optional, last, and one box: what the customer wants the rider to know. It travels
  // with the order (create_order stores it on the row), so the admin's order screen reads
  // it back exactly as typed.
  const noteSection = (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Add a note (optional)</Text>
      <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
        Anything we should know about this delivery.
      </Text>
      <Input
        value={orderNote}
        onChangeText={setOrderNote}
        placeholder="e.g. Call before arriving"
        multiline
        numberOfLines={3}
        maxLength={500}
      />
    </View>
  );

  return (
    <Screen header={<ScreenHeader title="Checkout" onBack={() => goBack()} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
        <ResponsiveContainer maxWidth={isDesktop ? 960 : 1320}>
          {isDesktop ? (
            <View style={styles.desktopLayout}>
              <View style={styles.formColumn}>
                {addressSection}
                {paymentBox}
                {noteSection}
              </View>
              <View style={styles.summaryColumn}>
                {summaryGroup}
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
                      disabled={success ? false : submitting}
                      fullWidth
                    />
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mobileStack}>
              {addressSection}
              {summaryGroup}
              {paymentBox}
              {noteSection}
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
                    disabled={success ? false : submitting}
                    fullWidth
                  />
                </View>
              </View>
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>
      <ConfirmDialog {...confirmDialogProps} />
    </Screen>
  );
}

/** The address-delete control is a circle: radius derived from its size, not the scale. */
const DELETE_BTN_SIZE = 30;

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  desktopLayout: { flexDirection: "row", gap: spacing.xl },
  formColumn: { flex: 1, gap: spacing.lg },
  summaryColumn: { flex: 1, gap: spacing.lg },
  mobileStack: { gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  addressList: { gap: spacing.sm, marginTop: spacing.xs },
  addressOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  addressOptionContent: { flex: 1, gap: 2 },
  addressLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  addressDetail: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  addressActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deleteBtn: {
    width: DELETE_BTN_SIZE,
    height: DELETE_BTN_SIZE,
    borderRadius: DELETE_BTN_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    paddingVertical: spacing.sm,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  // The order card and the money card are siblings, not a card in a card.
  summaryGroup: { gap: spacing.sm },
  summaryBox: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.xs },
  rowLabel: {
    flex: 1,
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  rowValue: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  feeNote: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.xs,
  },
  paymentBox: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  paymentMethod: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.xxs,
  },
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  success: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  bottomRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
