/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import { goBack } from '@/utils/navigation';
import { useState, useEffect } from "react";
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
import { normalizeError } from "../../../utils/errorHandling";
import { useAuth } from "../../../hooks/useAuth";

import { useAddresses } from "../../../hooks/useAddresses";

/**
 * The district has a canonical form the server's fee rule compares against, and the
 * number has a canonical form too: `+8801XXXXXXXXX`. The old form collected district and
 * postal code to price a fee that has never needed either at input time (a missing
 * district is the standard rate, decided in the database), so what is left is the number
 * — accepted the way a customer will actually type it and stored in the one shape the
 * checkout's own validation accepts.
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (/^\+8801[0-9]{9}$/.test(digits)) return digits;
  if (/^01[0-9]{9}$/.test(digits)) return `+880${digits}`;
  return null;
}

export default function EditAddressScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const params = useLocalSearchParams<{ addressId?: string }>();
  const addressId = typeof params.addressId === 'string' ? params.addressId : undefined;
  const { user } = useAuth();
  const { data: addresses, loading, create, update } = useAddresses();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = !!addressId;

  useEffect(() => {
    if (isEditing) {
      const found = addresses.find(a => a.id === addressId);
      if (found) {
        // The whole location lives in this one box now. Older rows split it across
        // `street` and `city`, so both are folded in here — and because saving writes the
        // box back to `street` with an empty `city`, reopening the form shows exactly what
        // was saved instead of re-splitting it.
        setAddress(found.city ? `${found.street}, ${found.city}` : found.street);
        setName(found.label);
        setPhone(found.phone || "");
        setIsDefault(Boolean(found.isDefault));
      }
    }
  }, [addresses, addressId, isEditing]);

  // A new address starts from what we already know about the customer: their name as the
  // recipient, their profile number as the contact. Both are still editable — this only
  // removes two things to retype.
  useEffect(() => {
    if (!isEditing && user) {
      setName(prev => prev || user.name || "");
      setPhone(prev => prev || user.phone || "");
    }
  }, [isEditing, user]);

  const handleSave = async () => {
    // Shown on the form, not in a dialog. Both of these used to be `Alert.alert(...)`,
    // which on web shows nothing at all — so a customer who submitted an empty form got
    // zero feedback, and a save the database rejected failed completely silently. That
    // second case is a real possibility here, not a hypothetical: the insert can be
    // refused, and there was no path by which the customer would ever learn that.
    setFormError(null);
    const trimmedAddress = address.trim();
    if (!name.trim() || !trimmedAddress) {
      setFormError("Please enter the recipient's name and the delivery address.");
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setFormError("Enter a Bangladeshi mobile number, e.g. 01712345678.");
      return;
    }

    setSaving(true);
    try {
      // `city` is sent empty on purpose: the form collects the location as one line, so
      // `street` carries all of it. `county`/`postalCode` are deliberately NOT sent — the
      // form no longer collects them, and omitting them leaves whatever an older address
      // already had (including its reduced delivery rate) exactly as it was.
      if (isEditing && addressId) {
        await update(addressId, {
          label: name.trim(),
          street: trimmedAddress,
          city: "",
          phone: normalizedPhone,
          isDefault,
        });
      } else {
        await create({
          label: name.trim(),
          street: trimmedAddress,
          city: "",
          phone: normalizedPhone,
          isDefault,
        });
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
        <Input label="Name" value={name} onChangeText={setName} placeholder="Who receives this order?" />
        <Input
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="House, road, area, city"
          multiline
          numberOfLines={3}
        />
        <Input
          label="Mobile"
          value={phone}
          onChangeText={setPhone}
          placeholder="01712345678"
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          This number is who we will call about the delivery.
        </Text>
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
  hint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: -spacing.xs,
  },
});
