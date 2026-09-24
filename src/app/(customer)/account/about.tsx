import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useShadows } from "../../../constants/shadows";
import SoftHeader from "../../../components/common/SoftHeader";
import AppLogo from "../../../components/common/AppLogo";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import config from "../../../constants/config";

export default function AboutScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="About Hibbullah" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.hero, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm }]}>
          <AppLogo size={48} />
          <Text style={[styles.brand, { color: colors.text }]}>Hibbullah</Text>
          <Text style={[styles.tag, { color: colors.textMuted }]}>Your pharmacy, simplified — Dhaka since 2023</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
          <Text style={[styles.h, { color: colors.text }]}>Our story</Text>
          <Text style={[styles.p, { color: colors.textMuted }]}>Hibbullah brings trusted medicines to your door in Dhaka. We partner with licensed manufacturers, keep cold-chain where needed, and show real stock — if it’s out of stock, it hides until restocked. One pending invoice keeps billing clean; admin confirms before a new invoice starts.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
          <Text style={[styles.h, { color: colors.text }]}>What we do</Text>
          <Text style={[styles.p, { color: colors.textMuted }]}>• 500+ generics & brands, searchable by name/brand/generic.{"\n"}• Delivery cycles 24h, delivery fee ৳{config.deliveryFee}.{"\n"}• Favorites & cart synced via Supabase, notifications for stock & order updates.{"\n"}• Admin cockpit for inventory, expiry, returns, audit.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
          <Text style={[styles.h, { color: colors.text }]}>Trust & safety</Text>
          <Text style={[styles.p, { color: colors.textMuted }]}>Licensed pharmacy, batch-tracked inventory, expiry 60-day warning, RLS-secured data, audit-logged admin actions. Support {config.supportEmail}.</Text>
          <Text style={[styles.ver, { color: colors.textMuted }]}>Version 1.0.0 · {config.appName}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  brand: { fontSize: typography.h2, fontWeight: "700", letterSpacing: -0.3 },
  tag: { fontSize: typography.caption, textAlign: "center" },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  h: { fontSize: typography.bodySmall, fontWeight: "700" },
  p: { fontSize: typography.bodySmall, lineHeight: 18 },
  ver: { fontSize: typography.caption, marginTop: spacing.xs },
});
