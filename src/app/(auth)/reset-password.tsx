import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useThemeColors } from "../../providers/ThemeProvider";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Alert from "../../components/common/Alert";
import Icon from "../../components/common/Icon";
import AppLogo from "../../components/common/AppLogo";
import AuthShell from "../../components/auth/AuthShell";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordScreen() {
  const colors = useThemeColors();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleUpdate = async () => {
    setError(null);
    if (!password || password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!hasSession) {
      setError("No recovery session found. Please open the reset link from your email on this device.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.replace("/(auth)/login");
    } catch (e: any) {
      setError(e?.message || "Could not update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <View style={styles.brand}>
        <AppLogo size={44} />
        <Text style={[styles.brandName, { color: colors.text }]}>Hibbullah</Text>
      </View>

      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>New password</Text>
        <Text style={[styles.subheading, { color: colors.textMuted }]}>Choose a secure password to complete the reset.</Text>
        {!hasSession ? (
          <Alert
            variant="warning"
            message="No recovery session detected — open the email link on this device."
            style={styles.headerAlert}
          />
        ) : null}
      </View>

      <View style={styles.form}>
        <Input
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          secureTextEntry={!showPassword}
          editable={!loading}
          prefix={<Icon name="lock" size={18} color={colors.textMuted} />}
          suffix={
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              style={styles.eyeButton}
            >
              <Icon
                name={showPassword ? "visibility-off" : "visibility"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          }
        />
        <Input
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          secureTextEntry={!showConfirmPassword}
          editable={!loading}
          prefix={<Icon name="lock" size={18} color={colors.textMuted} />}
          suffix={
            <Pressable
              onPress={() => setShowConfirmPassword((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
              style={styles.eyeButton}
            >
              <Icon
                name={showConfirmPassword ? "visibility-off" : "visibility"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          }
        />

        {error ? <Alert variant="danger" message={error} /> : null}

        <Button
          title={loading ? "Please wait..." : "Update password"}
          onPress={handleUpdate}
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
  // The header block centres its children; a banner wants the full column width.
  headerAlert: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
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
  eyeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
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
