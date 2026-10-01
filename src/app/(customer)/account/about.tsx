import { ScrollView, StyleSheet, Text, View } from "react-native";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import AppLogo from "../../../components/common/AppLogo";
import { useBottomInset } from "../../../hooks/useBottomInset";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import config from "../../../constants/config";

export default function AboutScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  return (
    <Screen header={<ScreenHeader title="About Hibbullah" onBack={goBack} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.backgroundAlt }]}>
          <AppLogo size={48} />
          <Text style={[styles.brand, { color: colors.text }]}>Hibbullah</Text>
          <Text style={[styles.tag, { color: colors.textMuted }]}>Your pharmacy, simplified — Dhaka since 2023</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.h, { color: colors.text }]}>Our story</Text>
          <Text style={[styles.p, { color: colors.textMuted }]}>Hibbullah brings trusted medicines to your door in Dhaka. We partner with licensed manufacturers and keep cold-chain where needed. A medicine that has run out cannot be added to your cart until the pharmacy restocks it. One pending invoice keeps billing clean; admin confirms before a new invoice starts.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.h, { color: colors.text }]}>What we do</Text>
          <Text style={[styles.p, { color: colors.textMuted }]}>• 500+ generics & brands, searchable by name/brand/generic.{"\n"}• 24h delivery cycles, nationwide. ৳{config.deliveryFees.insideDhaka} inside Dhaka District, ৳{config.deliveryFees.outsideDhaka} everywhere else.{"\n"}• Favorites & cart synced via Supabase, notifications for stock & order updates.{"\n"}• Admin cockpit for inventory, expiry, returns, audit.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.h, { color: colors.text }]}>Trust & safety</Text>
          <Text style={[styles.p, { color: colors.textMuted }]}>Licensed pharmacy, batch-tracked inventory, expiry 60-day warning, RLS-secured data, audit-logged admin actions. Support {config.supportEmail}.</Text>
          <Text style={[styles.ver, { color: colors.textMuted }]}>Version 1.0.0 · {config.appName}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  // White cards on the off-white page — no border, no shadow; the lightness step separates them.
  hero: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  brand: {
    fontFamily: fontFamily.soraBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  tag: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  h: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  p: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  ver: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.xs,
  },
});
