import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import { useBottomInset } from "../../../hooks/useBottomInset";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import config from "../../../constants/config";

/** One white card: Sora SemiBold heading over PJS body. Same shape as security.tsx. */
const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
      <Text style={[styles.h, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.p, { color: colors.textMuted }]}>{children}</Text>
    </View>
  );
};

export default function TermsPrivacyScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  return (
    <Screen header={<ScreenHeader title="Terms & Privacy" onBack={goBack} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.updated, { color: colors.textMuted }]}>Last updated: 22 Sep 2026 · Hibbullah, Dhaka</Text>

        <Section title="Terms of Service">
          By using Hibbullah you agree to provide accurate Gmail for auth and phone (+8801XXXXXXXXX) for delivery. Orders are cash on delivery. One pending invoice per customer — new items append until pharmacy confirms (Confirmed), then a new invoice starts. Prices and stock are live; out-of-stock items hide. Misuse, false returns, or stock manipulation may lead to account restriction. Support: {config.supportEmail}.
        </Section>

        <Section title="Privacy Policy">
          We collect: email (Auth), name/phone/picture (profiles), addresses, cart/favorites, orders. Phone is stored in profiles as a +880 number (source of truth), never used for Auth — only for delivery (required at checkout). Product and profile images are stored in Cloudinary (webp, max 1024px for products and 400px for pictures, max 5MB); replacing a picture overwrites the previous file, and removing one deletes it. All other data (profile, addresses, cart, favorites, orders) stays in our database. Realtime is limited to notifications/favorites/products/inventory (4 tables) with unique channel per screen to avoid free-tier limits. Data is RLS-secured (auth.uid = user_id, admin via is_admin allowlist). Audit logs admin actions. No phone is shared; delivery address is per order.
        </Section>

        <Section title="Data retention & rights">
          Orders and audit logs retained for fulfillment. You can update your name, phone and picture from your profile (tap your name at the top of Settings), change your password under Password & Security, delete addresses, clear cart, unfavorite. To delete account, email {config.supportEmail} with subject “Delete my data” — we remove profiles + auth within 30 days, keeping invoices for legal. Realtime can be disabled by polling on focus if you prefer low data.
        </Section>

        <Section title="Contact for legal">
          {config.appName} — House 12, Road 7, Dhanmondi, Dhaka 1209. Email {config.supportEmail} · Phone +880 96 1234 5678. For app permissions: Camera/Media for product images (admin) and profile pictures, no phone auth, no SMS OTP.
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  updated: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  // White card on the off-white page — the lightness step is the separation, so no border.
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
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
});
