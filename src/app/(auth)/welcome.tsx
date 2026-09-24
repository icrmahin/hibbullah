import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useAuth } from "../../hooks/useAuth";
import Button from "../../components/common/Button";
import AppLogo from "../../components/common/AppLogo";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius } from "../../constants/sizes";

export default function WelcomeScreen() {
  const colors = useThemeColors();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace("/" as any);
  }, [user, loading]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.outer}>
        <View style={styles.content}>
          <View style={styles.brand}>
            <AppLogo size={56} />
            <Text style={[styles.brandName, { color: colors.text }]}>Hibbullah</Text>
          </View>

          <View style={styles.hero}>
            <Text style={[styles.heading, { color: colors.text }]}>Your pharmacy, simplified.</Text>
            <Text style={[styles.subheading, { color: colors.textMuted }]}>
              Browse essentials, manage orders, and keep your care plan on track.
            </Text>
          </View>

          <View style={styles.spacer} />

          <View style={styles.actions}>
            <Button
              title="Get Started"
              onPress={() => router.push("/(auth)/login" as any)}
              fullWidth
              style={styles.primaryButton}
              accessibilityLabel="Get Started — continue to sign in or create account"
            />
            <Text style={[styles.hint, { color: colors.textMuted }]}>Sign in or create account on next screen</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  outer: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.massive,
    paddingBottom: spacing.xxl,
    alignItems: "center",
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 440,
  },
  brand: {
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  brandName: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.footnote,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.massive,
  },
  heading: {
    fontFamily: fontFamily.soraBold,
    fontSize: fontSize.largeTitle,
    lineHeight: 40,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subheading: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.callout,
    lineHeight: fontSize.callout * lineHeight.relaxed,
    textAlign: "center",
  },
  spacer: { flexGrow: 1 },
  actions: {
    gap: spacing.sm,
    alignItems: "center",
  },
  primaryButton: { borderRadius: radius.xl },
  hint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
});
