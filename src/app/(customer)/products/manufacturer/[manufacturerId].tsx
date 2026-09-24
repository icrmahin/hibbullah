import { router, useLocalSearchParams } from "expo-router";
import { goBack } from '@/utils/navigation';
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import Header from "../../../../components/common/Header";
import ProductCard from "../../../../components/products/ProductCard";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import EmptyState from "../../../../components/common/EmptyState";
import spacing from "../../../../constants/spacing";
import { useManufacturers, useProducts } from "../../../../hooks/useProducts";

export default function ManufacturerProductsScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ manufacturerId: string }>();
  const manufacturerId = params.manufacturerId as string;
  const { data: manufacturers, loading: manLoading } = useManufacturers();
  const { data: products, loading, error, reload } = useProducts(manufacturerId ? { manufacturerId } : {});

  const manufacturer = manufacturers.find((m) => m.id === manufacturerId);

  if (manLoading || loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <Header title={manufacturer?.name ?? "Manufacturer"} onBack={() => goBack()} />
        <LoadingState label="Loading products" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <Header title={manufacturer?.name ?? "Manufacturer"} onBack={() => goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Header title={manufacturer?.name ?? "Manufacturer"} onBack={() => goBack()} />
      <FlatList
        data={products}
        contentContainerStyle={styles.container}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard product={item} onPress={(product) => router.push({ pathname: "/(customer)/products/[productId]", params: { productId: product.id } })} />}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl }}>
            <EmptyState title="No products" message="No products from this manufacturer yet." />
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
