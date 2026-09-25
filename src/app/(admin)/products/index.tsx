import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../components/admin/AdminHeader";
import AdminProductCard from "../../../components/admin/AdminProductCard";
import type { Product } from "../../../types/product";
import Icon from "../../../components/common/Icon";
import EmptyState from "../../../components/common/EmptyState";
import FilterChip from "../../../components/common/FilterChip";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import SearchableSelect from "../../../components/common/SearchableSelect";
import SearchBar from "../../../components/common/SearchBar";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useShadows } from "../../../constants/shadows";
import { useResponsive } from "../../../hooks/useResponsive";
import { useCategories } from "../../../hooks/useProducts";
import { useAdminProducts } from "../../../hooks/useAdmin";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import { radius } from "../../../constants/sizes";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";

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
  const shadows = useShadows();
  const { isDesktop } = useResponsive();
  const twoColumns = isDesktop;

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

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Products" subtitle={`${time} · catalog`} />
        <LoadingState label="Loading products" />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Products" subtitle={`${time} · catalog`} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.listHeader}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search products" />

      <View
        style={[
          styles.filtersIsland,
          { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs },
        ]}
      >
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader
        title="Products"
        subtitle={`${time} · catalog`}
        action={
          <Pressable
            onPress={() => router.push("/(admin)/products/add")}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Icon name="add" size={16} color="#fff" />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        }
      />

      <View style={styles.container}>
        <ResponsiveContainer sidebarAware style={styles.flex}>
          <FlashList
            data={products}
            // Stable identity lets the list recycle rows while scrolling, which
            // is what keeps only a window of product images mounted.
            keyExtractor={(item: Product) => item.id}
            renderItem={({ item }) => (
              <View style={twoColumns ? styles.listItem : undefined}>
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
                    : "Add your first medicine to start the catalog."
                }
                actionLabel="Add product"
                onAction={() => router.push("/(admin)/products/add")}
              />
            }
            numColumns={twoColumns ? 2 : 1}
            // FlashList requires an explicit, stable height for multi-column
            // layouts, and a measured one for the rest.
            key={twoColumns ? "two" : "one"}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.4}
            drawDistance={DRAW_DISTANCE}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </ResponsiveContainer>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
  },
  addButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  listHeader: { gap: spacing.md, paddingBottom: spacing.sm },
  filtersIsland: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterLabel: {
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
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
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  listItem: { flexGrow: 1, flexBasis: "48%", minWidth: 0 },
  footer: { paddingVertical: spacing.lg },
});
