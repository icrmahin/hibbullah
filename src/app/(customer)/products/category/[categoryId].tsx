import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useThemeColors } from "../../../../providers/ThemeProvider";
import Screen from "../../../../components/common/Screen";
import ScreenHeader from "../../../../components/common/ScreenHeader";
import SearchBar from "../../../../components/common/SearchBar";
import ProductCard from "../../../../components/products/ProductCard";
import LoadingState from "../../../../components/common/LoadingState";
import ErrorState from "../../../../components/common/ErrorState";
import EmptyState from "../../../../components/common/EmptyState";
import spacing from "../../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../../constants/typography";
import { useProducts } from "../../../../hooks/useProducts";
import { isSearchableTerm } from "../../../../services/searchQuery";
import { useResponsive } from "../../../../hooks/useResponsive";
import { useBottomInset } from "../../../../hooks/useBottomInset";

const DRAW_DISTANCE = 1200

export default function CategoryProductsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  // Two product cards per row on a phone, growing from there — the same grid the catalog
  // and the search screen use, so a product looks the same wherever you reach it from.
  const { columns } = useResponsive();
  const params = useLocalSearchParams<{ categoryId: string }>();
  const categoryId = params.categoryId as string;
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
  } = useProducts({ categoryId, query });

  // The list functions join the category name onto every row, so the title does
  // not depend on loading and searching the whole category table. The products
  // list can legitimately be empty, hence the fallback.
  const categoryName = products[0]?.categoryName ?? "Category";
  const searching = isSearchableTerm(query);

  const resultText = searching
    ? total > 0
      ? `${total} ${total === 1 ? "match" : "matches"} for "${query.trim()}"`
      : `No matches for "${query.trim()}"`
    : hasMore
      ? `${products.length}+ products`
      : `${products.length} ${products.length === 1 ? "product" : "products"}`;

  return (
    <Screen header={<ScreenHeader title={categoryName} onBack={() => goBack()} />}>
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
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
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
              placeholder={`Search in ${categoryName}`}
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
              message={`Nothing in ${categoryName} matches "${query.trim()}".`}
              actionLabel="Clear search"
              onAction={() => setQuery("")}
            />
          ) : (
            <EmptyState
              title="No products"
              message="No products in this category yet."
              actionLabel="Browse everything"
              onAction={() => router.push("/(customer)/(tabs)/products")}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // FlashList v2 has no `columnWrapperStyle`, so the gutter is half-padding on the container
  // and half on every cell — the pairing the catalog uses. 12 + 4 is the same `spacing.lg`
  // page margin, so these cards sit exactly where the catalog's do.
  container: { paddingTop: spacing.sm, paddingHorizontal: spacing.md },
  gridItem: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.xs },
  resultText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  footer: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xs },
});
