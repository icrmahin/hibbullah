/* eslint-disable react-hooks/set-state-in-effect -- seeding the input from a route param requires setState inside an effect */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../providers/ThemeProvider";
import SoftHeader from "../../components/common/SoftHeader";
import SearchBar from "../../components/common/SearchBar";
import ProductCard from "../../components/products/ProductCard";
import LoadingState from "../../components/common/LoadingState";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import { useResponsive } from "../../hooks/useResponsive";
import { useProducts } from "../../hooks/useProducts";
import { isSearchableTerm } from "../../services/searchQuery";

const DRAW_DISTANCE = 1200

/** Shown before anything is typed, so the screen is never a blank box. */
const SUGGESTIONS = [
  "Paracetamol",
  "Napa",
  "Seclo",
  "Azithromycin",
  "Cefixime",
  "Omeprazole",
  "Montelukast",
  "Vitamin D",
];

export default function CustomerSearchScreen() {
  const colors = useThemeColors();
  // Seeded from the home screen's "See all N results", so arriving here with a
  // query already shows those results instead of an empty screen.
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery] = useState(params.query ?? "");
  const { isMobile, isTablet, columns } = useResponsive();

  useEffect(() => {
    const seeded = params.query;
    if (typeof seeded === "string" && seeded) setQuery(seeded);
  }, [params.query]);

  // useProducts rather than useProductSearch: the same hook backs every other
  // list in the app, so search pages the same way and the debounce, abort and
  // ranking are identical to the rest of the catalog.
  const {
    data: results,
    loading,
    loadingMore,
    error,
    total,
    hasMore,
    reload,
    loadMore,
  } = useProducts({ query });

  const gridColumns = isMobile ? 1 : isTablet ? 2 : columns;
  const searching = isSearchableTerm(query);
  const trimmed = query.trim();

  const resultText = useMemo(() => {
    if (!searching) return "";
    if (loading) return "Searching…";
    if (total > 0) return `${total} ${total === 1 ? "match" : "matches"} for "${trimmed}"`;
    return `No matches for "${trimmed}"`;
  }, [searching, loading, total, trimmed]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Search" onBack={() => goBack()} />
      <View style={styles.flex}>
        <FlashList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={gridColumns}
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
                placeholder="Search by medicine, brand or generic"
                autoFocus
              />
              {resultText ? (
                <Text style={[styles.resultText, { color: colors.textMuted }]}>{resultText}</Text>
              ) : null}
              {error ? <ErrorState message={error} onRetry={reload} /> : null}
              {!searching && !trimmed ? (
                <View style={styles.suggestions}>
                  <Text style={[styles.suggestionsLabel, { color: colors.textMuted }]}>
                    Try one of these
                  </Text>
                  <View style={styles.suggestionRow}>
                    {SUGGESTIONS.map((term) => (
                      <Pressable
                        key={term}
                        onPress={() => setQuery(term)}
                        style={({ pressed }) => [
                          styles.suggestion,
                          {
                            backgroundColor: colors.primarySoft,
                            borderColor: colors.borderSoft,
                          },
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Search for ${term}`}
                      >
                        <Text style={[styles.suggestionText, { color: colors.primary }]}>
                          {term}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
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
              <LoadingState label="Searching" />
            ) : error ? null : searching ? (
              <EmptyState
                title="No matches"
                message={`Nothing matches "${trimmed}". Search by medicine name, brand, or generic name — and check the spelling.`}
                actionLabel="Clear search"
                onAction={() => setQuery("")}
              />
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, paddingVertical: spacing.md },
  resultText: {
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingHorizontal: spacing.xs,
  },
  gridItem: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  suggestions: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  suggestionsLabel: {
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  suggestionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggestion: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestionText: { fontSize: typography.caption, fontWeight: "600" },
  footer: { paddingVertical: spacing.lg },
  pressed: { opacity: 0.6 },
});
