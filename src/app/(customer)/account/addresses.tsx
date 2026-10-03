import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import Button from '../../../components/common/Button';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import EmptyState from '../../../components/common/EmptyState';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import spacing from '../../../constants/spacing';
import { useAddresses } from '../../../hooks/useAddresses';
import { useBottomInset } from '../../../hooks/useBottomInset';
import { useConfirm } from '../../../hooks/useConfirm';
import { normalizeError } from '../../../utils/errorHandling';
import { radius } from '../../../constants/sizes';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';

export default function CustomerAddressesScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { data: addresses, loading, error, reload, setDefault, remove } = useAddresses();
  const { confirm, confirmDialogProps } = useConfirm();
  const [actionError, setActionError] = React.useState<string | null>(null);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Addresses" onBack={goBack} />}>
        <LoadingState label="Loading addresses" />
        <ConfirmDialog {...confirmDialogProps} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Addresses" onBack={goBack} />}>
        <ErrorState message={error} onRetry={reload} />
        <ConfirmDialog {...confirmDialogProps} />
      </Screen>
    );
  }

  const handleSetDefault = async (id: string) => {
    setActionError(null);
    try {
      await setDefault(id);
    } catch (e) {
      setActionError(normalizeError(e).message);
    }
  };

  // This one deleted immediately, with no confirmation at all. The checkout bin icon
  // always asked first, so the same action behaved differently depending on which screen
  // you were on — and a mis-tap on a full-width "Delete" link destroyed an address that
  // the customer then had to retype. Now that a real dialog exists, both ask.
  const handleDelete = async (id: string) => {
    setActionError(null);
    const target = addresses.find((a) => a.id === id);
    const ok = await confirm({
      title: 'Delete address',
      message: target
        ? `Remove "${target.label}" — ${[target.street, target.city].filter(Boolean).join(", ")}?`
        : 'Remove this saved location?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove(id);
    } catch (e) {
      setActionError(normalizeError(e).message);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Addresses" onBack={goBack} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        {actionError ? <Text style={[styles.error, { color: colors.danger }]}>{actionError}</Text> : null}
        {addresses.length === 0 ? (
          <EmptyState
            title="No addresses"
            message="Add your delivery address to place orders."
            icon="place"
          />
        ) : (
          addresses.map((address) => (
            <View key={address.id} style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text }]}>{address.label}{address.isDefault ? ' · Default' : ''}</Text>
              </View>
              {/* The city is optional now: a new-form address keeps its whole location in
                  `street`, so an empty city renders nothing rather than a dangling
                  comma. The mobile is its own line — it is contact information, not part
                  of where the parcel goes. */}
              <Text style={[styles.text, { color: colors.textMuted }]}>{[address.street, address.city].filter(Boolean).join(", ")}{address.county ? `, ${address.county}` : ''}{address.postalCode ? ` ${address.postalCode}` : ''}</Text>
              {address.phone ? <Text style={[styles.text, { color: colors.textMuted }]}>{address.phone}</Text> : null}
              <View style={styles.actions}>
                {!address.isDefault ? (
                  <Pressable
                    onPress={() => handleSetDefault(address.id)}
                    style={({ pressed }) => pressed && styles.pressed}
                    accessibilityRole="button"
                    accessibilityLabel={`Make ${address.label} the default address`}
                  >
                    <Text style={[styles.link, { color: colors.accent }]}>Set default</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => router.push({ pathname: '/(customer)/address/edit', params: { addressId: address.id } })}
                  style={({ pressed }) => pressed && styles.pressed}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${address.label}`}
                >
                  <Text style={[styles.link, { color: colors.accent }]}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(address.id)}
                  style={({ pressed }) => pressed && styles.pressed}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${address.label}`}
                >
                  <Text style={[styles.link, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Button title="Add address" onPress={() => router.push('/(customer)/address/edit')} fullWidth />
      </ScrollView>
      <ConfirmDialog {...confirmDialogProps} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  // White card on the off-white page — no border, no shadow; the lightness step separates it.
  card: { borderRadius: radius.lg, padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    marginBottom: spacing.xs,
  },
  text: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  link: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: 'center',
  },
  pressed: { opacity: 0.6 },
});
