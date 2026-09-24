import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import SoftHeader from '../../../components/common/SoftHeader';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import EmptyState from '../../../components/common/EmptyState';
import spacing from '../../../constants/spacing';
import { useManufacturers } from '../../../hooks/useProducts';

export default function CustomerManufacturersScreen() {
  const colors = useThemeColors();
  const { data: manufacturers, loading, error, reload } = useManufacturers();

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Manufacturers" onBack={() => goBack()} />
        <LoadingState label="Loading manufacturers" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Manufacturers" onBack={() => goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Manufacturers" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        {manufacturers.length === 0 ? (
          <EmptyState title="No manufacturers" message="Manufacturers will appear here once added." />
        ) : (
          manufacturers.map((manufacturer) => (
            <Text key={manufacturer.id} style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border, color: colors.text }]} onPress={() => router.push({ pathname: '/(customer)/products/manufacturer/[manufacturerId]', params: { manufacturerId: manufacturer.id } })}>{manufacturer.name}</Text>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: 16, borderWidth: 1, padding: spacing.lg },
});
