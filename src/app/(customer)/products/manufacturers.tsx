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
import { useManufacturers } from "../../../hooks/useProducts";
import { isSearchableTerm } from "../../../services/searchQuery";

const DRAW_DISTANCE = 600

export default function CustomerManufacturersScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [query, setQuery] = useState("");
  const { data: manufacturers, loading, error, reload } = useManufacturers(query);
  const searching = isSearchableTerm(query);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Manufacturers" onBack={() => goBack()} />
      <View style={styles.flex}>
        <FlashList
          data={manufacturers}
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
                  pathname: "/(customer)/products/manufacturer/[manufacturerId]",
                  params: { manufacturerId: item.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Browse ${item.name}`}
            >
              <View style={styles.cardTextWrap}>
                <Text style={[styles.cardText, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.country ? (
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.country}
                  </Text>
                ) : null}
              </View>
              <Icon name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
          )}
          ListHeaderComponent={
            <View style={styles.header}>
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder="Search manufacturers"
              />
              {!loading && !error ? (
                <Text style={[styles.resultText, { color: colors.textMuted }]}>
                  {manufacturers.length}
                  {manufacturers.length >= 200
                    ? "+ manufacturers"
                    : manufacturers.length === 1
                      ? " manufacturer"
                      : " manufacturers"}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <LoadingState label="Loading manufacturers" />
            ) : error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : searching ? (
              <EmptyState
                title="No manufacturers"
                message={`No manufacturer matches "${query.trim()}".`}
                actionLabel="Clear search"
                onAction={() => setQuery("")}
              />
            ) : (
              <EmptyState
                title="No manufacturers"
                message="Manufacturers will appear here once added."
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
  cardTextWrap: { flex: 1, gap: 2 },
  cardText: { fontSize: typography.body, fontWeight: "600" },
  cardMeta: { fontSize: typography.caption },
  pressed: { opacity: 0.6 },
});
