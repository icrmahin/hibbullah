import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { useThemeColors } from "../../providers/ThemeProvider";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Alert from "../../components/common/Alert";
import Icon from "../../components/common/Icon";
import AppLogo from "../../components/common/AppLogo";
import AuthShell from "../../components/auth/AuthShell";
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
    <AuthShell>
      <Pressable
        onPress={() => router.replace("/(auth)/login")}
        hitSlop={8}
        android_ripple={{ color: colors.ripple.primary, borderless: false }}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        style={styles.back}
      >
        <Icon name="arrow-back" size={20} color={colors.text} />
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
          prefix={<Icon name="mail" size={18} color={colors.textMuted} />}
        />

        {error ? <Alert variant="danger" message={error} /> : null}

        {sent ? <Alert variant="info" message="Reset link sent. Check your email — including spam." /> : null}

        <Button
          title={loading ? "Please wait..." : sent ? "Resend link" : "Send reset link"}
          onPress={handleSend}
          loading={loading}
          disabled={loading}
          fullWidth
          style={styles.submitButton}
        />

        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          style={styles.secondaryLink}
        >
          <Text style={[styles.secondaryText, { color: colors.accent }]}>Back to sign in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  // The header's back control: 36×36, borderless, `arrow-back` at 20 in the text colour.
  back: {
    width: 36,
    height: 36,
    marginLeft: -6,
    marginBottom: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    overflow: "hidden",
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
  submitButton: {
    marginTop: spacing.sm,
  },
  secondaryLink: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
