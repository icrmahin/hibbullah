import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import SoftHeader from '../../../components/common/SoftHeader';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import EmptyState from '../../../components/common/EmptyState';
import spacing from '../../../constants/spacing';
import { useCategories } from '../../../hooks/useProducts';

export default function CustomerCategoriesScreen() {
  const colors = useThemeColors();
  const { data: categories, loading, error, reload } = useCategories();

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Categories" onBack={() => goBack()} />
        <LoadingState label="Loading categories" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Categories" onBack={() => goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Categories" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        {categories.length === 0 ? (
          <EmptyState title="No categories" message="Categories will appear here once added." />
        ) : (
          categories.map((category) => (
            <Text key={category.id} style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border, color: colors.text }]} onPress={() => router.push({ pathname: '/(customer)/products/category/[categoryId]', params: { categoryId: category.id } })}>
              {category.name}
            </Text>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#D0D6D4', padding: spacing.lg, color: '#18201E', fontSize: 14, fontWeight: '600' },
});
