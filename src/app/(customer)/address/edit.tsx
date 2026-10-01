/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import { goBack } from '@/utils/navigation';
import { useState, useEffect, useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import Input from "../../../components/common/Input";
import Button from "../../../components/common/Button";
import Toggle from "../../../components/common/Toggle";
import LoadingState from "../../../components/common/LoadingState";
import InlineAlert from "../../../components/common/Alert";
import { useBottomInset } from "../../../hooks/useBottomInset";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import { resolveDistrict } from "../../../constants/districts";
import { deliveryFeeForDistrict } from "../../../utils/deliveryFee";
import { formatCurrency } from "../../../utils/currency";
import { normalizeError } from "../../../utils/errorHandling";

import { useAddresses } from "../../../hooks/useAddresses";

export default function EditAddressScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
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

  // The district is typed rather than picked, so it is resolved against the 64 known
  // names on every keystroke. The canonical name that comes back is what gets stored,
  // which is the only form the server's delivery-fee rule can match.
  const district = useMemo(() => resolveDistrict(county), [county]);

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
    // District is required because it decides the delivery fee, and it has to be a name
    // the server recognises: the fee rule is a single comparison, so anything unrecognised
    // is billed at the full ৳150 rate. A free-text field lets "Daka" or "ঢাকা" through
    // silently and then charges a Dhaka customer ৳70 extra with nothing on screen saying
    // why — so an unrecognised district is refused here, at the point the information
    // exists, and the customer is told what was expected.
    if (!county.trim()) {
      setFormError("Please enter your district — it decides your delivery charge.");
      return;
    }
    if (!district) {
      setFormError(
        `“${county.trim()}” is not a district we recognise. Use the English name ` +
          `(for example Dhaka, Chattogram, Bogura) or the Bangla name.`,
      );
      return;
    }
    const countyName = district.name;

    setSaving(true);
    try {
      if (isEditing && addressId) {
        await update(addressId, { street: street.trim(), city: city.trim(), county: countyName, postalCode: postalCode.trim(), label: label.trim() || 'Home', isDefault });
      } else {
        await create({ street: street.trim(), city: city.trim(), county: countyName, postalCode: postalCode.trim(), label: label.trim() || 'Home', isDefault });
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
      <Screen header={<ScreenHeader title="Edit Address" onBack={goBack} />}>
        <LoadingState label="Loading address" />
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader title={isEditing ? "Edit Address" : "Add Address"} onBack={goBack} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Input label="Street Address" value={street} onChangeText={setStreet} placeholder="House, road, area" />
        <Input label="City / area" value={city} onChangeText={setCity} placeholder="e.g. Mirpur DOHS" />
        <Input
          label="District"
          value={county}
          onChangeText={setCounty}
          placeholder="e.g. Dhaka"
          autoCapitalize="words"
          autoCorrect={false}
        />
        {county.trim() ? (
          district ? (
            <Text style={[styles.feeHint, { color: colors.textMuted }]}>
              Delivery to {district.name}:{" "}
              {formatCurrency(deliveryFeeForDistrict(district.name))}
            </Text>
          ) : (
            <Text style={[styles.feeHintWarn, { color: colors.danger }]}>
              Not a district we recognise.
            </Text>
          )
        ) : null}
        <Input label="Postal Code" value={postalCode} onChangeText={setPostalCode} placeholder="e.g. 1205" keyboardType="numeric" />
        <Input label="Label" value={label} onChangeText={setLabel} placeholder="e.g. Home, Office" />
        <View style={[styles.switchRow, { gap: spacing.sm }]}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Set as default</Text>
          <Toggle value={isDefault} onValueChange={setIsDefault} accessibilityLabel="Set as default address" />
        </View>
        {formError ? <InlineAlert variant="danger" title="Cannot save" message={formError} /> : null}
        <Button title={saving ? "Saving..." : "Save Address"} onPress={handleSave} fullWidth disabled={saving} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  feeHint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: -spacing.xs,
  },
  feeHintWarn: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: -spacing.xs,
  },
});
