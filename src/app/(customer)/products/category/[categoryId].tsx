import { router, useLocalSearchParams } from "expo-router";
import { goBack } from '@/utils/navigation';
import { FlatList, StyleSheet, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import Header from "../../../../components/common/Header";
import ProductCard from "../../../../components/products/ProductCard";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import EmptyState from "../../../../components/common/EmptyState";
import spacing from "../../../../constants/spacing";
import { useCategories, useProducts } from "../../../../hooks/useProducts";

export default function CategoryProductsScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ categoryId: string }>();
  const categoryId = params.categoryId as string;
  const { data: categories, loading: catLoading } = useCategories();
  const { data: products, loading, error, reload } = useProducts(categoryId ? { categoryId } : {});

  const category = categories.find((c) => c.id === categoryId);

  if (catLoading || loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <Header title={category?.name ?? "Category"} onBack={() => goBack()} />
        <LoadingState label="Loading products" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <Header title={category?.name ?? "Category"} onBack={() => goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Header title={category?.name ?? "Category"} onBack={() => goBack()} />
      <FlatList
        data={products}
        contentContainerStyle={styles.container}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard product={item} onPress={(product) => router.push({ pathname: "/(customer)/products/[productId]", params: { productId: product.id } })} />}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl }}>
            <EmptyState title="No products" message="No products in this category yet." />
          </View>
        }
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
