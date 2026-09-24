import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import Button from '../../../components/common/Button';
import SoftHeader from '../../../components/common/SoftHeader';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import EmptyState from '../../../components/common/EmptyState';
import spacing from '../../../constants/spacing';
import { useAddresses } from '../../../hooks/useAddresses';

export default function CustomerAddressesScreen() {
  const colors = useThemeColors();
  const { data: addresses, loading, error, reload, setDefault, remove } = useAddresses();
  const [actionError, setActionError] = React.useState<string | null>(null);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Addresses" onBack={() => goBack()} />
        <LoadingState label="Loading addresses" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Addresses" onBack={() => goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  const handleSetDefault = async (id: string) => {
    setActionError(null);
    try {
      await setDefault(id);
    } catch (e: any) {
      setActionError(e.message || 'Failed to set default');
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await remove(id);
    } catch (e: any) {
      setActionError(e.message || 'Failed to delete');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Addresses" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        {actionError ? <Text style={[styles.error, { color: colors.danger }]}>{actionError}</Text> : null}
        {addresses.length === 0 ? (
          <EmptyState title="No addresses" message="Add your delivery address to place orders." />
        ) : (
          addresses.map((address) => (
            <View key={address.id} style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text }]}>{address.label}{address.isDefault ? ' · Default' : ''}</Text>
              </View>
              <Text style={[styles.text, { color: colors.textMuted }]}>{address.street}</Text>
              <Text style={[styles.text, { color: colors.textMuted }]}>{address.city}{address.county ? `, ${address.county}` : ''}{address.postalCode ? ` ${address.postalCode}` : ''}</Text>
              <View style={styles.actions}>
                {!address.isDefault ? (
                  <Pressable onPress={() => handleSetDefault(address.id)}>
                    <Text style={[styles.link, { color: colors.primary }]}>Set default</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => router.push({ pathname: '/(customer)/address/edit', params: { addressId: address.id } })}>
                  <Text style={[styles.link, { color: colors.primary }]}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(address.id)}>
                  <Text style={[styles.link, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Button title="Add address" onPress={() => router.push('/(customer)/address/edit')} fullWidth />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { borderRadius: 16, borderWidth: 1, padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: "700", marginBottom: spacing.xs },
  text: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  link: { fontWeight: '700', fontSize: 12 },
  error: { fontSize: 12, textAlign: 'center' },
});
