import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useShadows } from "../../../constants/shadows";
import SoftHeader from "../../../components/common/SoftHeader";
import Icon from "../../../components/common/Icon";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import config from "../../../constants/config";

type FAQ = { q: string; a: string };

const FAQS: FAQ[] = [
  { q: "How do I place an order?", a: "Browse medicines → Add to cart → Checkout → Select delivery address → Submit. Auth is Gmail only; phone (+8801XXXXXXXXX) is required only at checkout for delivery. Cart clears after order." },
  { q: "Why is my phone required?", a: "Phone is stored in your profile (not Auth) and is used solely for delivery coordination. You can update it in Profile Details. We never use it for login." },
  { q: "How does the single-invoice work?", a: "All items you add before acceptance go into one pending invoice. After the pharmacy accepts (Confirmed), your next checkout creates a new invoice. This keeps billing clean." },
  { q: "When will my order be delivered?", a: "Delivery cycles are 24 hours (orderCycleHours 24). Your Delivery Cycle screen shows active cycle closes_at. Client checks expiry on app open — no background cron needed." },
  { q: "Stock shows out of stock?", a: "Products auto-deactivate when stock 0 (is_active false) and notify you if it was in cart/favorites. Restock by admin reactivates it. Low stock (<10) shows warning." },
  { q: "How to return a medicine?", a: "Only Delivered orders can be returned. Open Order Detail → Select items → Reason → Submit. Admin validates via validate_return RPC." },
  { q: "I forgot my password?", a: "Login → Forgot password → we send recovery email (hibbullah://). Check spam. Link expires in 1 hour." },
];

export default function HelpFAQScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Help & FAQ" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.hero, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm }]}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>How can we help?</Text>
          <Text style={[styles.heroSub, { color: colors.textMuted }]}>Soft feather help — tap a question. Contact {config.supportEmail} if still stuck.</Text>
        </View>
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <Pressable key={f.q} onPress={() => setOpen(isOpen ? null : i)} style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
              <View style={styles.qRow}>
                <Text style={[styles.q, { color: colors.text }]}>{f.q}</Text>
                <Icon name={isOpen ? "expand-less" : "expand-more"} size={20} color={colors.textMuted} />
              </View>
              {isOpen ? <Text style={[styles.a, { color: colors.textMuted }]}>{f.a}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  heroTitle: { fontSize: typography.h3, fontWeight: "700" },
  heroSub: { fontSize: typography.caption, lineHeight: 16 },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  qRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  q: { flex: 1, fontSize: typography.bodySmall, fontWeight: "700" },
  a: { fontSize: typography.bodySmall, lineHeight: 18 },
});
