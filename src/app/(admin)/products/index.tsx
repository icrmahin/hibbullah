import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import AdminProductCard from "../../../components/admin/AdminProductCard";
import type { Product } from "../../../types/product";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import Icon from "../../../components/common/Icon";
import EmptyState from "../../../components/common/EmptyState";
import FilterChip from "../../../components/common/FilterChip";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import SearchableSelect from "../../../components/common/SearchableSelect";
import SearchBar from "../../../components/common/SearchBar";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { useCategories } from "../../../hooks/useProducts";
import { useAdminProducts } from "../../../hooks/useAdmin";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import { radius } from "../../../constants/sizes";
import { spacing } from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";

type StatusFilter = "all" | "active" | "inactive";
type StockFilter = "all" | "in_stock" | "low" | "out";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const STOCK_FILTERS: { label: string; value: StockFilter }[] = [
  { label: "All", value: "all" },
  { label: "In stock", value: "in_stock" },
  { label: "Low stock", value: "low" },
  { label: "Out of stock", value: "out" },
];

/**
 * How far beyond the viewport rows stay mounted, in dp.
 *
 * The catalog is expected to reach 4k+ products. A ScrollView that maps over
 * every row mounts 4,000 product cards — and 4,000 product images — at once,
 * which is what made this screen unusable at scale. FlashList only mounts what
 * is within this distance of the viewport, so the cost of scrolling stays
 * proportional to the screen rather than to the catalog. Large enough to avoid
 * blank rows on a fast flick, small enough to keep the image count bounded.
 */
const DRAW_DISTANCE = 1200

export default function AdminProductsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  // One product per row on a phone, growing from there, and this is the whole bug this
  // screen had.
  //
  // `AdminProductCard` is a *row* card: an 88px photo beside the name, the badge, the price
  // and the stock count. It was being asked to lay out inside a FlashList of `columns` —
  // the *product grid* count, which is 2 on every phone width. At 393dp that is a 164px
  // cell: 104px of it is the photo and its padding, leaving 36px for every piece of text.
  // The name is `flex: 1` in a row with the status badge, so the badge's intrinsic width
  // drove the name to zero, and the brand, the price and the unit count all clipped.
  // `minWidth: 0` on the cell meant it clipped rather than overflowed, so nothing spilled
  // and nothing looked broken — the catalog rendered as two columns of unreadable slivers
  // and read as "no products here".
  //
  // `listColumns` is the row-shaped count: 1 on a phone, 2 at tablet, 3 on a desktop, and
  // capped there. It is what the order and customer screens already use, and the comment on
  // it in useResponsive describes this exact case — "an order row is a status, a date, an
  // item count and a total, and at 170px wide it wraps into a shape nobody can read".
  const { listColumns } = useResponsive();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categoryId, setCategoryId] = useState("all");
  const [categoryTerm, setCategoryTerm] = useState("");

  const { data: products, loading, loadingMore, error, total, hasMore, reload, loadMore } =
    useAdminProducts({
      status: status === "all" ? undefined : status,
      stockFilter: stockFilter === "all" ? undefined : stockFilter,
      categoryId: categoryId === "all" ? undefined : categoryId,
      query: query || undefined,
    });

  // Returning from Add Product uses goBack(), which does not remount this
  // screen — without this the list keeps the rows it had before the upload
  // (often the "No products found" empty state) until a manual retry.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const hasActiveFilters = status !== "all" || stockFilter !== "all" || categoryId !== "all";
  const clearFilters = useCallback(() => {
    setQuery("");
    setStatus("all");
    setStockFilter("all");
    setCategoryId("all");
  }, []);
  const { data: categories, loading: categoriesLoading } = useCategories(categoryTerm);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ label: c.name, value: c.id })),
    [categories],
  );
  // The chosen category can fall outside the current search result set, so the
  // label is carried rather than looked up in whatever rows came back.
  const selectedCategoryName =
    categoryOptions.find((c) => c.value === categoryId)?.label ?? "Selected category";

  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Only take the whole screen on the very first load. A focus-triggered
  // reload with rows already mounted keeps the list visible (with pull to
  // refresh available) instead of flashing back to a spinner.
  const showFullLoading = loading && products.length === 0;
  const refreshing = loading && products.length > 0;

  if (showFullLoading) {
    return (
      <Screen header={<ScreenHeader title="Products" subtitle={`${time} · catalog`} />}>
        <LoadingState label="Loading products" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen header={<ScreenHeader title="Products" subtitle={`${time} · catalog`} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  const header = (
    <View style={styles.listHeader}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search products" />

      <View style={[styles.filtersIsland, { backgroundColor: colors.backgroundAlt }]}>
        <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Status</Text>
        <View style={styles.chipRow}>
          {STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              selected={status === filter.value}
              onPress={() => setStatus(filter.value)}
            />
          ))}
        </View>

        <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Stock</Text>
        <View style={styles.chipRow}>
          {STOCK_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              selected={stockFilter === filter.value}
              onPress={() => setStockFilter(filter.value)}
            />
          ))}
        </View>

        <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Category</Text>
        {/*
          A chip per category was unusable once the catalog grew past a handful:
          hundreds of chips wrapped into a screen-height wall with no way to find
          one. The searchable picker is the same control the product form uses.
        */}
        <SearchableSelect
          label="Category"
          value={categoryId === "all" ? undefined : categoryId}
          options={categoryOptions}
          selectedLabel={selectedCategoryName}
          onSelect={(value) => setCategoryId(value ?? "all")}
          onSearch={setCategoryTerm}
          loading={categoriesLoading}
          placeholder="All categories"
          searchPlaceholder="Search categories"
          emptyMessage="No categories match."
        />
      </View>

      <Text style={[styles.count, { color: colors.textMuted }]}>
        {query.trim() && total > 0
          ? `${total} ${total === 1 ? "match" : "matches"} for "${query.trim()}"`
          : `${products.length}${hasMore ? "+" : ""} ${products.length === 1 ? "product" : "products"}`}
      </Text>
    </View>
  );

  const footer = loadingMore ? (
    <View style={styles.footer}>
      <LoadingState label="Loading more" />
    </View>
  ) : null;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Products"
          subtitle={`${time} · catalog`}
          action={
            <Pressable
              onPress={() => router.push("/(admin)/products/add")}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add product"
            >
              <Icon name="add" size={16} color={colors.textInverse} />
              <Text style={[styles.addButtonText, { color: colors.textInverse }]}>Add</Text>
            </Pressable>
          }
        />
      }
    >
      {/* ResponsiveContainer owns the page margin, so this wrapper keeps only the
          bottom inset — otherwise the 16px gutter is applied twice. */}
      <View style={[styles.container, { paddingBottom: bottomInset }]}>
        {/* innerStyle flex: 1 gives FlashList a bounded height on native. On
            web a View sizes to its content, but on native the
            ResponsiveContainer inner had no flex so the list measured zero
            height and rendered blank even with rows loaded. */}
        <ResponsiveContainer sidebarAware style={styles.flex} innerStyle={styles.flex}>
          <FlashList
            data={products}
            // Stable identity lets the list recycle rows while scrolling, which
            // is what keeps only a window of product images mounted.
            keyExtractor={(item: Product) => item.id}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <AdminProductCard
                  product={item}
                  onPress={(product) =>
                    router.push({
                      pathname: "/(admin)/products/[productId]",
                      params: { productId: product.id },
                    })
                  }
                />
              </View>
            )}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            ListEmptyComponent={
              <EmptyState
                title="No products found"
                message={
                  query.trim()
                    ? `Nothing matches "${query.trim()}". Try a different search or clear the filters.`
                    : hasActiveFilters
                      ? "No products match these filters. Clear them to see the full catalog."
                      : "Add your first medicine to start the catalog. If you just uploaded one and it is not here, pull to refresh or check Inventory — every stocked upload leaves a batch row there."
                }
                actionLabel={hasActiveFilters && !query.trim() ? "Clear filters" : "Add product"}
                onAction={() => {
                  if (hasActiveFilters && !query.trim()) clearFilters();
                  else router.push("/(admin)/products/add");
                }}
              />
            }
            numColumns={listColumns}
            // FlashList requires a stable key that changes with the column count, or it
            // recycles cells laid out for the wrong width.
            key={`cols-${listColumns}`}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.4}
            drawDistance={DRAW_DISTANCE}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </ResponsiveContainer>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // No horizontal padding: ResponsiveContainer below supplies the page gutter, so the
  // 16px margin exists exactly once.
  container: { flex: 1 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: radius.pill,
  },
  // The colour comes from the palette at the call site — this is a `StyleSheet`, outside
  // React, so it cannot reach `useThemeColors()`. Was `color: "#fff"`.
  addButtonText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  listHeader: { gap: spacing.md, paddingBottom: spacing.sm },
  // A white card, not an island: no border, no shadow — the page colour does the framing.
  filtersIsland: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    marginTop: spacing.xs,
  },
  // A wrapping row rather than a horizontal ScrollView: nested horizontal
  // scrolling inside a vertical virtualized list is unreliable, and a chip that
  // is off-screen was previously unreachable.
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  count: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  /**
   * The gutter between catalog cards.
   *
   * This was `flexBasis: "48%"` with no gap, so the space between two cards was 4% of
   * whatever the column happened to be — about 12px at two columns and 8px at three, and
   * a percentage that quietly means something different at every column count. FlashList
   * v2 has no `columnWrapperStyle`, so the customer grids pair half-gutter padding on the
   * container with half-gutter padding on every cell instead, and the cells then sit on the
   * same 4px rhythm at one column or five. This is that technique, at the same size.
   */
  listItem: { flexGrow: 1, paddingHorizontal: spacing.sm, minWidth: 0 },
  footer: { paddingVertical: spacing.lg },
});
