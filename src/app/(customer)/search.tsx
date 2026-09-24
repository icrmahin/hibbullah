import { router } from "expo-router";
import { goBack } from '@/utils/navigation';
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";
import SoftHeader from "../../components/common/SoftHeader";
import SearchBar from "../../components/common/SearchBar";
import ProductCard from "../../components/products/ProductCard";
import LoadingState from "../../components/common/LoadingState";
import ErrorState from "../../components/common/ErrorState";
import spacing from "../../constants/spacing";
import { useProductSearch } from "../../hooks/useProducts";
import { useState } from "react";

export default function CustomerSearchScreen() {
  const colors = useThemeColors();
  const [query, setQuery] = useState("");
  const { data: results, loading, error } = useProductSearch(query);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Search" onBack={() => goBack()} />
      <FlatList
        data={results}
        contentContainerStyle={styles.container}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard product={item} onPress={(product) => router.push({ pathname: "/(customer)/products/[productId]", params: { productId: product.id } })} />}
        ListHeaderComponent={
          <>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search by medicine, brand or generic" />
            {loading ? <LoadingState label="Searching" /> : null}
            {error ? <ErrorState message={error} /> : null}
          </>
        }
        ListEmptyComponent={!loading && !error ? <View style={styles.empty}><Text style={[styles.emptyText, { color: colors.textMuted }]}>{query.trim() ? "No products matched your search." : "Type to search medicines."}</Text></View> : null}
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
  empty: { alignItems: "center", paddingVertical: spacing.xxl },
  emptyText: { fontSize: 12 },
});
