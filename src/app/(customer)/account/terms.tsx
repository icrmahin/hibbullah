import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useShadows } from "../../../constants/shadows";
import SoftHeader from "../../../components/common/SoftHeader";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import config from "../../../constants/config";

const Section = ({ title, children, colors, shadows }: any) => (
  <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
    <Text style={[styles.h, { color: colors.text }]}>{title}</Text>
    <Text style={[styles.p, { color: colors.textMuted }]}>{children}</Text>
  </View>
);

export default function TermsPrivacyScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Terms & Privacy" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.updated, { color: colors.textMuted }]}>Last updated: 22 Sep 2026 · Hibbullah, Dhaka</Text>

        <Section title="Terms of Service" colors={colors} shadows={shadows}>
          By using Hibbullah you agree to provide accurate Gmail for auth and phone (+8801XXXXXXXXX) for delivery. Orders are cash on delivery. One pending invoice per customer — new items append until pharmacy confirms (Confirmed), then a new invoice starts. Prices and stock are live; out-of-stock items hide. Misuse, false returns, or stock manipulation may lead to account restriction. Support: {config.supportEmail}.
        </Section>

        <Section title="Privacy Policy" colors={colors} shadows={shadows}>
          We collect: email (Auth), name/phone (profiles), addresses, cart/favorites, orders. Phone is stored in profiles (source of truth), never used for Auth — only for delivery (required at checkout). Product images are stored in Cloudinary (webp, max 1024px, max 5MB); all other data (profile, addresses, cart, favorites, orders) stays in our database. Realtime is limited to notifications/favorites/products/inventory (4 tables) with unique channel per screen to avoid free-tier limits. Data is RLS-secured (auth.uid = user_id, admin via is_admin allowlist). Audit logs admin actions. No phone is shared; delivery address is per order.
        </Section>

        <Section title="Data retention & rights" colors={colors} shadows={shadows}>
          Orders and audit logs retained for fulfillment. You can update name/phone in Profile Details, delete addresses, clear cart, unfavorite. To delete account, email {config.supportEmail} with subject “Delete my data” — we remove profiles + auth within 30 days, keeping invoices for legal. Realtime can be disabled by polling on focus if you prefer low data.
        </Section>

        <Section title="Contact for legal" colors={colors} shadows={shadows}>
          {config.appName} — House 12, Road 7, Dhanmondi, Dhaka 1209. Email {config.supportEmail} · Phone +880 96 1234 5678. For app permissions: Camera/Media for product images (admin), no phone auth, no SMS OTP.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  updated: { fontSize: typography.caption, textAlign: "center" },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  h: { fontSize: typography.bodySmall, fontWeight: "700" },
  p: { fontSize: typography.bodySmall, lineHeight: 18 },
});
