/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import { goBack } from '@/utils/navigation';
import { useState, useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import SoftHeader from "../../../components/common/SoftHeader";
import Input from "../../../components/common/Input";
import Button from "../../../components/common/Button";
import LoadingState from "../../../components/common/LoadingState";
import spacing from "../../../constants/spacing";

import { useAddresses } from "../../../hooks/useAddresses";

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
    if (!street.trim() || !city.trim()) {
      Alert.alert("Missing fields", "Please enter street address and city");
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
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save address");
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
        <Input label="City" value={city} onChangeText={setCity} placeholder="e.g. Dhaka" />
        <Input label="District" value={county} onChangeText={setCounty} placeholder="e.g. Dhaka" />
        <Input label="Postal Code" value={postalCode} onChangeText={setPostalCode} placeholder="e.g. 1205" keyboardType="numeric" />
        <Input label="Label" value={label} onChangeText={setLabel} placeholder="e.g. Home, Office" />
        <View style={[styles.switchRow, { gap: spacing.sm }]}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Set as default</Text>
          <Switch value={isDefault} onValueChange={setIsDefault} />
        </View>
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
});
