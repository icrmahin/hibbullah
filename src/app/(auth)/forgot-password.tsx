import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Mail, ArrowLeft } from "lucide-react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import AppLogo from "../../components/common/AppLogo";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius } from "../../constants/sizes";
import { supabase } from "../../lib/supabase";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ForgotPasswordScreen() {
  const colors = useThemeColors();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setError(null);
    const e = email.trim();
    if (!e) {
      setError("Please enter your email.");
      return;
    }
    if (!isValidEmail(e)) {
      setError("Please enter a valid email.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = Linking.createURL("reset-password");
      const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Could not send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.outer}>
          <View style={styles.content}>
            <Pressable
              onPress={() => router.replace("/(auth)/login")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              style={styles.backRow}
            >
              <ArrowLeft size={18} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.backText, { color: colors.textMuted }]}>Back to sign in</Text>
            </Pressable>

            <View style={styles.brand}>
              <AppLogo size={44} />
              <Text style={[styles.brandName, { color: colors.text }]}>Hibbullah</Text>
            </View>

            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.text }]}>Forgot password?</Text>
              <Text style={[styles.subheading, { color: colors.textMuted }]}>
                Enter your email and we&apos;ll send a reset link.
              </Text>
            </View>

            <View style={styles.form}>
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                editable={!loading}
                prefix={<Mail size={18} color={colors.textMuted} strokeWidth={1.8} />}
              />

              {error ? (
                <View style={[styles.message, { backgroundColor: colors.redSoft, borderColor: colors.dangerBorder }]}>
                  <Text style={[styles.messageText, { color: colors.danger }]}>{error}</Text>
                </View>
              ) : null}

              {sent ? (
                <View style={[styles.message, { backgroundColor: colors.primarySoft, borderColor: colors.borderLight }]}>
                  <Text style={[styles.messageText, { color: colors.primary }]}>
                    Reset link sent. Check your email — including spam.
                  </Text>
                </View>
              ) : null}

              <Button
                title={loading ? "Please wait..." : sent ? "Resend link" : "Send reset link"}
                onPress={handleSend}
                loading={loading}
                disabled={loading}
                fullWidth
                style={styles.primaryButton}
              />

              <Pressable
                onPress={() => router.replace("/(auth)/login")}
                hitSlop={8}
                style={styles.secondaryLink}
              >
                <Text style={[styles.secondaryText, { color: colors.primary }]}>Back to sign in</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  outer: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: "center",
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 440,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  backText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
  },
  brand: {
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  brandName: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.footnote,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  heading: {
    fontFamily: fontFamily.soraBold,
    fontSize: fontSize.title1,
    lineHeight: fontSize.title1 * lineHeight.tight,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subheading: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.callout,
    lineHeight: fontSize.callout * lineHeight.normal,
    textAlign: "center",
  },
  form: {
    gap: spacing.md,
  },
  message: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageText: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    textAlign: "center",
  },
  primaryButton: {
    borderRadius: radius.xl,
    marginTop: spacing.sm,
  },
  secondaryLink: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
  },
});
