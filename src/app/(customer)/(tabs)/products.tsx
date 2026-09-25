import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import SoftHeader from "../../../components/common/SoftHeader";
import SearchBar from "../../../components/common/SearchBar";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import SearchableSelect from "../../../components/common/SearchableSelect";
import ProductCard from "../../../components/products/ProductCard";
import LoadingState from "../../../components/common/LoadingState";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { useResponsive } from "../../../hooks/useResponsive";
import { useProducts, useCategories, useManufacturers } from "../../../hooks/useProducts";
import { isSearchableTerm } from "../../../services/searchQuery";

/** Rows kept mounted beyond the viewport, in dp. */
const DRAW_DISTANCE = 1200

export default function CustomerProductsScreen() {
  const colors = useThemeColors();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [manufacturerId, setManufacturerId] = useState<string | null>(null);
  const [categoryTerm, setCategoryTerm] = useState("");
  const [manufacturerTerm, setManufacturerTerm] = useState("");
  const { isMobile, isTablet, columns } = useResponsive();

  const {
    data: products,
    loading,
    loadingMore,
    error,
    total,
    hasMore,
    reload,
    loadMore,
  } = useProducts({
    categoryId: categoryId || undefined,
    manufacturerId: manufacturerId || undefined,
    query,
  });
  const { data: categories, loading: categoriesLoading } = useCategories(categoryTerm);
  const { data: manufacturers, loading: manufacturersLoading } = useManufacturers(manufacturerTerm);

  const gridColumns = isMobile ? 1 : isTablet ? 2 : columns;
  const searching = isSearchableTerm(query);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ label: c.name, value: c.id })),
    [categories],
  );
  const manufacturerOptions = useMemo(
    () => manufacturers.map((m) => ({ label: m.name, value: m.id })),
    [manufacturers],
  );

  // The stored label can fall outside the current search result set, so it is
  // carried explicitly rather than looked up in whatever rows came back.
  const selectedCategory = categoryId
    ? categoryOptions.find((c) => c.value === categoryId)?.label ?? "Selected category"
    : undefined;
  const selectedManufacturer = manufacturerId
    ? manufacturerOptions.find((m) => m.value === manufacturerId)?.label ?? "Selected manufacturer"
    : undefined;

  const resultText = searching
    ? total > 0
      ? `${total} ${total === 1 ? "match" : "matches"} for "${query.trim()}"`
      : `No matches for "${query.trim()}"`
    : hasMore
      ? `${products.length}+ products`
      : `${products.length} ${products.length === 1 ? "product" : "products"}`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Products" subtitle="Browse by category and manufacturer" />
      <View style={styles.flex}>
        <ResponsiveContainer style={styles.flex}>
          <FlashList
            data={products}
            keyExtractor={(item) => item.id}
            numColumns={gridColumns}
            // FlashList needs a stable key when the column count changes, and an
            // explicit height for multi-column layouts.
            key={gridColumns === 1 ? "one" : `cols-${gridColumns}`}
            drawDistance={DRAW_DISTANCE}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
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
                  placeholder="Search products"
                />

                <View style={styles.filters}>
                  <SearchableSelect
                    label="Category"
                    value={categoryId ?? undefined}
                    options={categoryOptions}
                    selectedLabel={selectedCategory}
                    onSelect={(value) => setCategoryId(value === categoryId ? null : value)}
                    onSearch={setCategoryTerm}
                    loading={categoriesLoading}
                    placeholder="All categories"
                    searchPlaceholder="Search categories"
                    emptyMessage="No categories match."
                    style={styles.filter}
                  />
                  {categoryId ? (
                    <Pressable
                      onPress={() => setCategoryId(null)}
                      style={styles.clearFilter}
                      accessibilityRole="button"
                      accessibilityLabel="Clear the category filter"
                    >
                      <Text style={[styles.clearFilterText, { color: colors.textMuted }]}>
                        All categories
                      </Text>
                    </Pressable>
                  ) : null}

                  <SearchableSelect
                    label="Manufacturer"
                    value={manufacturerId ?? undefined}
                    options={manufacturerOptions}
                    selectedLabel={selectedManufacturer}
                    onSelect={(value) =>
                      setManufacturerId(value === manufacturerId ? null : value)
                    }
                    onSearch={setManufacturerTerm}
                    loading={manufacturersLoading}
                    placeholder="All manufacturers"
                    searchPlaceholder="Search manufacturers"
                    emptyMessage="No manufacturers match."
                    style={styles.filter}
                  />
                  {manufacturerId ? (
                    <Pressable
                      onPress={() => setManufacturerId(null)}
                      style={styles.clearFilter}
                      accessibilityRole="button"
                      accessibilityLabel="Clear the manufacturer filter"
                    >
                      <Text style={[styles.clearFilterText, { color: colors.textMuted }]}>
                        All manufacturers
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <Text style={[styles.resultText, { color: colors.textMuted }]}>{resultText}</Text>
                {selectedCategory || selectedManufacturer ? (
                  <Text style={[styles.appliedFilters, { color: colors.textMuted }]} numberOfLines={1}>
                    {[selectedCategory, selectedManufacturer].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
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
                  message={`Nothing matches "${query.trim()}". Try a shorter term, or a brand or generic name.`}
                />
              ) : (
                <EmptyState
                  title="No products here"
                  message="No products in this category yet. Try another category or clear the filters."
                  actionLabel="Clear filters"
                  onAction={() => {
                    setCategoryId(null);
                    setManufacturerId(null);
                  }}
                />
              )
            }
          />
        </ResponsiveContainer>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  filters: { gap: spacing.sm },
  filter: { width: "100%" },
  clearFilter: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  clearFilterText: {
    fontSize: typography.caption,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  resultText: {
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  appliedFilters: { fontSize: typography.caption, marginTop: -spacing.xs },
  /**
   * FlashList v2 has no `columnWrapperStyle`, so the gutter between columns is
   * produced by pairing half-gutter padding on the container with half-gutter
   * padding on every cell. Cells then sit on a 4px rhythm whether they are in a
   * one-, two-, or five-column layout.
   */
  content: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xxl },
  gridItem: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  footer: { paddingVertical: spacing.lg },
});
