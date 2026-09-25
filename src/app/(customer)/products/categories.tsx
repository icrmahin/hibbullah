import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import SoftHeader from "../../../components/common/SoftHeader";
import SearchBar from "../../../components/common/SearchBar";
import Icon from "../../../components/common/Icon";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import { useShadows } from "../../../constants/shadows";
import { radius } from "../../../constants/sizes";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { useCategories } from "../../../hooks/useProducts";
import { isSearchableTerm } from "../../../services/searchQuery";

const DRAW_DISTANCE = 600

export default function CustomerCategoriesScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [query, setQuery] = useState("");
  const { data: categories, loading, error, reload } = useCategories(query);
  const searching = isSearchableTerm(query);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Categories" onBack={() => goBack()} />
      <View style={styles.flex}>
        <FlashList
          data={categories}
          keyExtractor={(item) => item.id}
          drawDistance={DRAW_DISTANCE}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.container}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.backgroundAlt,
                  borderColor: colors.borderSoft,
                  ...shadows.xs,
                },
                pressed && styles.pressed,
              ]}
              onPress={() =>
                router.push({
                  pathname: "/(customer)/products/category/[categoryId]",
                  params: { categoryId: item.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Browse ${item.name}`}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
                <Icon name="category" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.cardText, { color: colors.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Icon name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
          )}
          ListHeaderComponent={
            <View style={styles.header}>
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder="Search categories"
              />
              {!loading && !error ? (
                <Text style={[styles.resultText, { color: colors.textMuted }]}>
                  {categories.length}
                  {hasMoreSuffix(categories.length)}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <LoadingState label="Loading categories" />
            ) : error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : searching ? (
              <EmptyState
                title="No categories"
                message={`No category matches "${query.trim()}".`}
                actionLabel="Clear search"
                onAction={() => setQuery("")}
              />
            ) : (
              <EmptyState
                title="No categories"
                message="Categories will appear here once added."
              />
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

/** The lookup is capped, so a full page means there may be more behind it. */
function hasMoreSuffix(count: number): string {
  return count >= 200 ? "+ categories" : count === 1 ? " category" : " categories";
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  resultText: {
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 56,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1, fontSize: typography.body, fontWeight: "600" },
  pressed: { opacity: 0.6 },
});
