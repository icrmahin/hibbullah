import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Eye, EyeOff, LockKeyhole } from "lucide-react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import AppLogo from "../../components/common/AppLogo";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius } from "../../constants/sizes";
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.outer}>
          <View style={styles.content}>
            <View style={styles.brand}>
              <AppLogo size={44} />
              <Text style={[styles.brandName, { color: colors.text }]}>Hibbullah</Text>
            </View>

            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.text }]}>New password</Text>
              <Text style={[styles.subheading, { color: colors.textMuted }]}>Choose a secure password to complete the reset.</Text>
              {!hasSession ? (
                <View style={[styles.message, { backgroundColor: colors.amberSoft, borderColor: colors.warningBorder }]}>
                  <Text style={[styles.messageText, { color: colors.warning }]}>
                    No recovery session detected — open the email link on this device.
                  </Text>
                </View>
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
                prefix={<LockKeyhole size={18} color={colors.textMuted} strokeWidth={1.8} />}
                suffix={
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    style={styles.eyeButton}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={colors.textMuted} strokeWidth={1.8} />
                    ) : (
                      <Eye size={18} color={colors.textMuted} strokeWidth={1.8} />
                    )}
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
                prefix={<LockKeyhole size={18} color={colors.textMuted} strokeWidth={1.8} />}
                suffix={
                  <Pressable
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
                    style={styles.eyeButton}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} color={colors.textMuted} strokeWidth={1.8} />
                    ) : (
                      <Eye size={18} color={colors.textMuted} strokeWidth={1.8} />
                    )}
                  </Pressable>
                }
              />

              {error ? (
                <View style={[styles.message, { backgroundColor: colors.redSoft, borderColor: colors.dangerBorder }]}>
                  <Text style={[styles.messageText, { color: colors.danger }]}>{error}</Text>
                </View>
              ) : null}

              <Button
                title={loading ? "Please wait..." : "Update password"}
                onPress={handleUpdate}
                loading={loading}
                disabled={loading}
                fullWidth
                style={styles.primaryButton}
              />

              <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8} style={styles.secondaryLink}>
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
  eyeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
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
