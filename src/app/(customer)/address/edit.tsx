/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import { goBack } from '@/utils/navigation';
import { useState, useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import SoftHeader from "../../../components/common/SoftHeader";
import Input from "../../../components/common/Input";
import Button from "../../../components/common/Button";
import LoadingState from "../../../components/common/LoadingState";
import SearchableSelect from "../../../components/common/SearchableSelect";
import type { SelectOption } from "../../../components/common/SearchableSelect";
import InlineAlert from "../../../components/common/Alert";
import spacing from "../../../constants/spacing";
import { DISTRICTS } from "../../../constants/districts";
import { deliveryFeeForDistrict } from "../../../utils/deliveryFee";
import { formatCurrency } from "../../../utils/currency";
import { normalizeError } from "../../../utils/errorHandling";

import { useAddresses } from "../../../hooks/useAddresses";

// English name on the row, with the Bangla name and the division underneath. Customers look
// for their own district in Bangla, and the division is the next thing they would say after
// the name — "Bogura, Rajshahi" — so putting it on the row means the search matches the way
// people actually describe where they live. `value` is the canonical English name, which is
// what gets stored and what the delivery-fee rule compares.
const DISTRICT_OPTIONS: SelectOption[] = DISTRICTS.map((d) => ({
  label: d.name,
  value: d.name,
  hint: `${d.bn} · ${d.division} Division`,
}));

export default function EditAddressScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ addressId?: string }>();
  const addressId = typeof params.addressId === 'string' ? params.addressId : undefined;
  const { data: addresses, loading, create, update } = useAddresses();
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [label, setLabel] = useState("Home");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = !!addressId;

  useEffect(() => {
    if (isEditing) {
      const found = addresses.find(a => a.id === addressId);
      if (found) {
        setStreet(found.street);
        setCity(found.city);
        setCounty(found.county || "");
        setPostalCode(found.postalCode || "");
        setLabel(found.label);
        setIsDefault(Boolean(found.isDefault));
      }
    }
  }, [addresses, addressId, isEditing]);

  const handleSave = async () => {
    // Shown on the form, not in a dialog. Both of these used to be `Alert.alert(...)`,
    // which on web shows nothing at all — so a customer who submitted an empty form got
    // zero feedback, and a save the database rejected failed completely silently. That
    // second case is a real possibility here, not a hypothetical: the insert can be
    // refused, and there was no path by which the customer would ever learn that.
    setFormError(null);
    if (!street.trim() || !city.trim()) {
      setFormError("Please enter a street address and a city.");
      return;
    }
    // District is required because it decides the delivery fee. Left optional, an
    // address with no district silently costs the outside-Dhaka rate forever and the
    // customer never finds out why — so the choice is made explicit at the point where
    // the information exists.
    if (!county.trim()) {
      setFormError("Please choose a district — it decides your delivery charge.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing && addressId) {
        await update(addressId, { street: street.trim(), city: city.trim(), county: county.trim(), postalCode: postalCode.trim(), label: label.trim() || 'Home', isDefault });
      } else {
        await create({ street: street.trim(), city: city.trim(), county: county.trim(), postalCode: postalCode.trim(), label: label.trim() || 'Home', isDefault });
      }
      goBack();
    } catch (err) {
      setFormError(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && isEditing) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Edit Address" onBack={() => goBack()} />
        <LoadingState label="Loading address" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title={isEditing ? "Edit Address" : "Add Address"} onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <Input label="Street Address" value={street} onChangeText={setStreet} placeholder="House, road, area" />
        <Input label="City / area" value={city} onChangeText={setCity} placeholder="e.g. Mirpur DOHS" />
        <SearchableSelect
          label="District"
          value={county || undefined}
          // An address saved before the picker existed holds free text, and a district
          // that was mistyped or has since been renamed is not in the list. Passing the
          // stored value through as `selectedLabel` keeps it visible on the trigger
          // instead of silently showing the placeholder, which would look like the field
          // had been cleared.
          selectedLabel={county || undefined}
          options={DISTRICT_OPTIONS}
          onSelect={setCounty}
          placeholder="Select district"
          searchPlaceholder="Search district — English or Bangla"
          emptyMessage="No district matches. Check the spelling, or ask support."
        />
        {county ? (
          <Text style={[styles.feeHint, { color: colors.textMuted }]}>
            Delivery to {county}: {formatCurrency(deliveryFeeForDistrict(county))}
          </Text>
        ) : null}
        <Input label="Postal Code" value={postalCode} onChangeText={setPostalCode} placeholder="e.g. 1205" keyboardType="numeric" />
        <Input label="Label" value={label} onChangeText={setLabel} placeholder="e.g. Home, Office" />
        <View style={[styles.switchRow, { gap: spacing.sm }]}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Set as default</Text>
          <Switch value={isDefault} onValueChange={setIsDefault} />
        </View>
        {formError ? <InlineAlert variant="danger" title="Cannot save" message={formError} /> : null}
        <Button title={saving ? "Saving..." : "Save Address"} onPress={handleSave} fullWidth disabled={saving} loading={saving} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 14, fontWeight: "500" },
  feeHint: { fontSize: 12, marginTop: -spacing.xs },
});
