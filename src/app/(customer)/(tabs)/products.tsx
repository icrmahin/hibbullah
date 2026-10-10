import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { goToProduct } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import SearchBar from "../../../components/common/SearchBar";
import SearchableSelect from "../../../components/common/SearchableSelect";
import ProductCard from "../../../components/products/ProductCard";
import LoadingState from "../../../components/common/LoadingState";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { useProducts, useCategories } from "../../../hooks/useProducts";
import { isSearchableTerm } from "../../../services/searchQuery";

/** Rows kept mounted beyond the viewport, in dp. */
const DRAW_DISTANCE = 1200

export default function CustomerProductsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryTerm, setCategoryTerm] = useState("");
  const { columns } = useResponsive();

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
    query,
  });
  const { data: categories, loading: categoriesLoading } = useCategories(categoryTerm);

  const searching = isSearchableTerm(query);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ label: c.name, value: c.id })),
    [categories],
  );

  const selectedCategory = categoryId
    ? categoryOptions.find((c) => c.value === categoryId)?.label ?? "Selected category"
    : undefined;

  const resultText = searching
    ? total > 0
      ? `${total} ${total === 1 ? "match" : "matches"} for "${query.trim()}"`
      : `No matches for "${query.trim()}"`
    : hasMore
      ? `${products.length}+ products`
      : `${products.length} ${products.length === 1 ? "product" : "products"}`;

  return (
    <Screen header={<ScreenHeader title="Products" subtitle="Browse by category" />}>
      <FlashList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        key={`cols-${columns}`}
        drawDistance={DRAW_DISTANCE}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <ProductCard
              product={item}
              onPress={(product) => goToProduct(product.id)}
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
            </View>

            <Text style={[styles.resultText, { color: colors.textMuted }]}>{resultText}</Text>
            {selectedCategory ? (
              <Text style={[styles.appliedFilters, { color: colors.textMuted }]} numberOfLines={1}>
                {selectedCategory}
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
              icon="search-off"
            />
          ) : (
            <EmptyState
              title="No products here"
              message="No products in this category yet. Try another category or clear the filters."
              actionLabel="Clear filters"
              onAction={() => {
                setCategoryId(null);
              }}
              icon="inventory-2"
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  filters: { gap: spacing.sm },
  filter: { width: "100%" },
  clearFilter: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  clearFilterText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textDecorationLine: "underline",
  },
  resultText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  appliedFilters: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: -spacing.xs,
  },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  gridItem: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  footer: { paddingVertical: spacing.lg },
});
