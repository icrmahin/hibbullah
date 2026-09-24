import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../components/admin/AdminHeader";
import Button from "../../../components/common/Button";
import Input from "../../../components/common/Input";
import LoadingState from "../../../components/common/LoadingState";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useAuth } from "../../../hooks/useAuth";
import { useAdminInventory } from "../../../hooks/useAdmin";
import { useProducts } from "../../../hooks/useProducts";
import { createStockAdjustment } from "../../../services/admin";
import spacing from "../../../constants/spacing";

export default function InventoryAdjustmentScreen() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const { data: inventory } = useAdminInventory();
  const { data: products } = useProducts({ limit: 100 } as any);

  const [productId, setProductId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [type, setType] = useState<'increase' | 'decrease'>('increase');
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    if (!productId.trim()) {
      setError('Product ID is required. Copy it from Products → detail.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Quantity must be a positive integer.');
      return;
    }
    if (!batchNumber.trim()) {
      setError('Batch number is required.');
      return;
    }
    if (!reason.trim()) {
      setError('Reason is required.');
      return;
    }
    if (!user) {
      setError('Not signed in as admin.');
      return;
    }
    setSaving(true);
    try {
      await createStockAdjustment({
        product_id: productId.trim(),
        batch_number: batchNumber.trim(),
        type,
        quantity: qty,
        reason: reason.trim(),
        admin_id: user.id,
      });
      setSuccess(true);
      setQuantity("");
      setReason("");
    } catch (e: any) {
      setError(e.message || 'Failed to save adjustment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Stock adjustment" subtitle="Record stock changes" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.form}>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Find Product ID in Products → open product → copy ID. Batches: {(inventory || []).length} loaded, Products: {(products || []).length} loaded.
          </Text>
          <Input label="Product ID" value={productId} onChangeText={setProductId} placeholder="uuid from product detail" autoCapitalize="none" />
          <Input label="Batch number" value={batchNumber} onChangeText={setBatchNumber} placeholder="e.g. BATCH-001" autoCapitalize="none" />
          <Input label="Type (increase/decrease)" value={type} onChangeText={(v) => setType(v.trim().toLowerCase() === 'decrease' ? 'decrease' : 'increase')} placeholder="increase" autoCapitalize="none" />
          <Input label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Restock, damaged, audit correction" />
          <Input label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="e.g. 10" />
        </View>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {success ? <Text style={[styles.success, { color: colors.success }]}>Adjustment saved. Stock updated via trigger.</Text> : null}
        <Button
          title={saving ? "Saving..." : "Save adjustment"}
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  form: { gap: spacing.md },
  hint: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 12, textAlign: 'center' },
  success: { fontSize: 12, textAlign: 'center' },
});
