import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import Icon from "../../../components/common/Icon";
import { useBottomInset } from "../../../hooks/useBottomInset";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../../constants/typography";
import { opacity, radius } from "../../../constants/sizes";
import config from "../../../constants/config";

type FAQ = { q: string; a: string };

const FAQS: FAQ[] = [
  { q: "How do I place an order?", a: "Browse medicines → Add to cart → Checkout → Select delivery address → Submit. Auth is Gmail only; phone (+8801XXXXXXXXX) is required only at checkout for delivery. Cart clears after order." },
  { q: "Why is my phone required?", a: "Phone is stored in your profile (not Auth) and is used solely for delivery coordination. You can update it in Profile Details. We never use it for login." },
  { q: "How does the single-invoice work?", a: "All items you add before acceptance go into one pending invoice. After the pharmacy accepts (Confirmed), your next checkout creates a new invoice. This keeps billing clean." },
  { q: "When will my order be delivered?", a: "Delivery cycles are 24 hours (orderCycleHours 24). Your Delivery Cycle screen shows active cycle closes_at. Client checks expiry on app open — no background cron needed." },
  { q: "A product won’t go in my cart?", a: "We don’t publish stock levels, so there is no count or availability label on a product. If it can’t be added, the medicine has run out and the pharmacy has not restocked it yet — the add button is disabled until then. Anything already in your cart or favourites is flagged for you when that happens." },
  { q: "How to return a medicine?", a: "Only Delivered orders can be returned. Open Order Detail → Select items → Reason → Submit. Admin validates via validate_return RPC." },
  { q: "I forgot my password?", a: "Login → Forgot password → we send recovery email (hibbullah://). Check spam. Link expires in 1 hour." },
];

export default function HelpFAQScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Screen header={<ScreenHeader title="Help & FAQ" onBack={goBack} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>How can we help?</Text>
          <Text style={[styles.heroSub, { color: colors.textMuted }]}>Soft feather help — tap a question. Contact {config.supportEmail} if still stuck.</Text>
        </View>
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <Pressable
              key={f.q}
              onPress={() => setOpen(isOpen ? null : i)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.backgroundAlt },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <View style={styles.qRow}>
                <Text style={[styles.q, { color: colors.text }]}>{f.q}</Text>
                <Icon name={isOpen ? "expand-less" : "expand-more"} size={20} color={colors.textMuted} />
              </View>
              {isOpen ? <Text style={[styles.a, { color: colors.textMuted }]}>{f.a}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  // White cards on the off-white page — no border, no shadow; the lightness step separates them.
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  heroTitle: {
    fontFamily: fontFamily.soraBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  heroSub: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  qRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  q: {
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  a: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  pressed: { opacity: opacity.pressed },
});
