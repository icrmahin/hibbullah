import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import Header from "../../../../components/common/Header";
import SearchBar from "../../../../components/common/SearchBar";
import ProductCard from "../../../../components/products/ProductCard";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import EmptyState from "../../../../components/common/EmptyState";
import spacing from "../../../../constants/spacing";
import typography from "../../../../constants/typography";
import { useProducts } from "../../../../hooks/useProducts";
import { isSearchableTerm } from "../../../../services/searchQuery";
import { useResponsive } from "../../../../hooks/useResponsive";

const DRAW_DISTANCE = 1200

export default function ManufacturerProductsScreen() {
  const colors = useThemeColors();
  // Two product cards per row on a phone, growing from there — the same grid the catalog
  // and the search screen use, so a product looks the same wherever you reach it from.
  const { columns } = useResponsive();
  const params = useLocalSearchParams<{ manufacturerId: string }>();
  const manufacturerId = params.manufacturerId as string;
  const [query, setQuery] = useState("");

  const {
    data: products,
    loading,
    loadingMore,
    error,
    total,
    hasMore,
    reload,
    loadMore,
  } = useProducts({ manufacturerId, query });

  const manufacturerName = products[0]?.manufacturerName ?? "Manufacturer";
  const searching = isSearchableTerm(query);

  const resultText = searching
    ? total > 0
      ? `${total} ${total === 1 ? "match" : "matches"} for "${query.trim()}"`
      : `No matches for "${query.trim()}"`
    : hasMore
      ? `${products.length}+ products`
      : `${products.length} ${products.length === 1 ? "product" : "products"}`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Header title={manufacturerName} onBack={() => goBack()} />
      <View style={styles.flex}>
        <FlashList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          // FlashList recycles cells laid out for the current width, so the key has to move
          // with the column count or a resize leaves every card the wrong size.
          key={`cols-${columns}`}
          drawDistance={DRAW_DISTANCE}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.container}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <ProductCard
                product={item}
                onPress={(product) =>
                  router.push({
                    pathname: "/(customer)/products/[productId]",
                    params: { productId: product.id },
                  })
                }
              />
            </View>
          )}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View style={styles.header}>
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder={`Search in ${manufacturerName}`}
              />
              <Text style={[styles.resultText, { color: colors.textMuted }]}>{resultText}</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <LoadingState label="Loading more" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <LoadingState label="Loading products" />
            ) : error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : searching ? (
              <EmptyState
                title="No matches"
                message={`Nothing from ${manufacturerName} matches "${query.trim()}".`}
                actionLabel="Clear search"
                onAction={() => setQuery("")}
              />
            ) : (
              <EmptyState
                title="No products"
                message="No products from this manufacturer yet."
                actionLabel="Browse everything"
                onAction={() => router.push("/(customer)/(tabs)/products")}
              />
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  // FlashList v2 has no `columnWrapperStyle`, so the gutter is half-padding on the container
  // and half on every cell — the pairing the catalog uses. 12 + 4 is the same `spacing.lg`
  // page margin, so these cards sit exactly where the catalog's do.
  container: { paddingVertical: spacing.lg, paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  gridItem: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  resultText: {
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  footer: { paddingVertical: spacing.lg },
});
