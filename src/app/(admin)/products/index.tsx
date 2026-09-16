import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../components/admin/AdminHeader";
import AdminProductCard from "../../../components/admin/AdminProductCard";
import Button from "../../../components/common/Button";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import FilterChip from "../../../components/common/FilterChip";
import LoadingState from "../../../components/common/LoadingState";
import SearchBar from "../../../components/common/SearchBar";
import colors from "../../../constants/colors";
import config from "../../../constants/config";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { getAdminProducts } from "../../../services/admin/adminProductService";
import { getCategories } from "../../../services/categoryService";
import type { Category } from "../../../types/category";
import type { Product } from "../../../types/product";
import { normalizeError } from "../../../utils/errorHandling";

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

export default function AdminProductsScreen() {
  const { width } = useWindowDimensions();
  const twoColumns = width >= 720;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categoryId, setCategoryId] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productList, categoryList] = await Promise.all([
        getAdminProducts(),
        getCategories(),
      ]);
      setProducts(productList);
      setCategories(categoryList);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      if (status === "active" && !product.isActive) return false;
      if (status === "inactive" && product.isActive) return false;
      if (categoryId !== "all" && product.categoryId !== categoryId) return false;
      if (stockFilter === "in_stock" && product.stock <= 0) return false;
      if (
        stockFilter === "low" &&
        !(product.stock > 0 && product.stock < config.lowStockThreshold)
      ) {
        return false;
      }
      if (stockFilter === "out" && product.stock > 0) return false;
      if (
        q &&
        ![product.name, product.brand, product.genericName]
          .join(" ")
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [products, query, status, stockFilter, categoryId]);

  if (loading) return <LoadingState label="Loading products…" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader
        title="Products"
        subtitle="Manage catalog and stock"
        action={
          <Button title="Add" onPress={() => router.push("/(admin)/products/add")} />
        }
      />

      <ScrollView contentContainerStyle={styles.container}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search products"
        />

        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STATUS_FILTERS.map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                selected={status === filter.value}
                onPress={() => setStatus(filter.value)}
              />
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STOCK_FILTERS.map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                selected={stockFilter === filter.value}
                onPress={() => setStockFilter(filter.value)}
              />
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <FilterChip
              label="All categories"
              selected={categoryId === "all"}
              onPress={() => setCategoryId("all")}
            />
            {categories.map((category) => (
              <FilterChip
                key={category.id}
                label={category.name}
                selected={categoryId === category.id}
                onPress={() => setCategoryId(category.id)}
              />
            ))}
          </ScrollView>
        </View>

        {error ? (
          <ErrorState
            title="Could not load products"
            message={error}
            onRetry={load}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No products found"
            message={
              products.length === 0
                ? "Add your first medicine to start the catalog."
                : "Try a different search or clear the filters."
            }
            actionLabel="Add product"
            onAction={() => router.push("/(admin)/products/add")}
          />
        ) : (
          <>
            <Text style={styles.count}>
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </Text>
            <View style={[styles.list, twoColumns && styles.listTwoCol]}>
              {filtered.map((product) => (
                <View key={product.id} style={twoColumns ? styles.listItem : undefined}>
                  <AdminProductCard
                    product={product}
                    onPress={(item) =>
                      router.push({
                        pathname: "/(admin)/products/[productId]",
                        params: { productId: item.id },
                      })
                    }
                  />
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  filters: { gap: spacing.sm },
  chipRow: { gap: spacing.sm, paddingRight: spacing.sm },
  count: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: spacing.xs,
  },
  list: { gap: spacing.md },
  listTwoCol: { flexDirection: "row", flexWrap: "wrap" },
  listItem: { flexGrow: 1, flexBasis: "48%", minWidth: 0 },
});