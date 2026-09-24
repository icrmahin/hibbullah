import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Eye, EyeOff, LockKeyhole, Mail, Phone, User } from "lucide-react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import Button from "../common/Button";
import Input from "../common/Input";
import AppLogo from "../common/AppLogo";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius } from "../../constants/sizes";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";

type AuthMode = "signin" | "signup";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function humanizeAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid email or password")) {
    return "Incorrect email or password. Please try again.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please check your email to confirm your account before signing in.";
  }
  if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("already exists")) {
    return "An account with this email already exists. Try signing in.";
  }
  if (msg.includes("password should be at least 6 characters")) {
    return "Password should be at least 6 characters.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Please check your connection and try again.";
  }
  return raw;
}

const ADMIN_EMAILS = new Set(["icrmahin@gmail.com", "hibbullah82026@gmail.com"]);

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export default function UnifiedAuth({ initialMode = "signin" }: { initialMode?: AuthMode }) {
  const colors = useThemeColors();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: AuthMode) => {
    if (next === mode) return;
    setError(null);
    setInfo(null);
    setMode(next);
  };

  const handleSignIn = async () => {
    setError(null);
    setInfo(null);
    const e = email.trim();
    if (!e) {
      setError("Please enter your email.");
      return;
    }
    if (!isValidEmail(e)) {
      setError("Please enter a valid email.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setLoading(true);
    try {
      await login({ email: e, password });
      router.replace("/");
    } catch (err: any) {
      setError(humanizeAuthError(err?.message || "Sign in failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError(null);
    setInfo(null);
    const n = fullName.trim();
    const e = email.trim();
    const p = phone.trim();
    if (!n) {
      setError("Please enter your name.");
      return;
    }
    if (!e) {
      setError("Please enter your email.");
      return;
    }
    if (!isValidEmail(e)) {
      setError("Please enter a valid email.");
      return;
    }
    const adminLike = isAdminEmail(e);
    if (!adminLike && !p) {
      setError("Please enter your phone number.");
      return;
    }
    if (p && !/^\+?8801[0-9]{9}$/.test(p)) {
      setError("Please enter a valid phone number. Example: +8801XXXXXXXXX");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    if (password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }
    if (!confirmPassword) {
      setError("Please confirm your password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register({
        name: n,
        phone: p || "",
        email: e,
        password,
        confirmPassword,
      });
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setInfo("Check your email — we sent you a confirmation link to continue.");
        return;
      }
      router.replace("/");
    } catch (err: any) {
      setError(humanizeAuthError(err?.message || "Could not create account. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const isSignIn = mode === "signin";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.scrollOuter}>
          <View style={styles.content}>
            <View style={styles.brand}>
              <AppLogo size={44} />
              <Text style={[styles.brandName, { color: colors.text }]}>Hibbullah</Text>
            </View>

            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.text }]}>
                {isSignIn ? "Welcome back" : "Create your account"}
              </Text>
              <Text style={[styles.subheading, { color: colors.textMuted }]}>
                {isSignIn ? "Sign in to continue" : "Start using Hibbullah"}
              </Text>
            </View>

            <View style={[styles.toggle, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSignIn }}
                onPress={() => switchMode("signin")}
                style={[styles.toggleOption, isSignIn && { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: isSignIn ? colors.white : colors.textMuted },
                    isSignIn && styles.toggleTextActive,
                  ]}
                >
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !isSignIn }}
                onPress={() => switchMode("signup")}
                style={[styles.toggleOption, !isSignIn && { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: !isSignIn ? colors.white : colors.textMuted },
                    !isSignIn && styles.toggleTextActive,
                  ]}
                >
                  Create Account
                </Text>
              </Pressable>
            </View>

            <View style={styles.form}>
              {!isSignIn ? (
                <Input
                  label="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!loading}
                  prefix={<User size={18} color={colors.textMuted} strokeWidth={1.8} />}
                />
              ) : null}

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

              {!isSignIn && (
                <Input
                  label="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+8801XXXXXXXXX"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  editable={!loading}
                  hint="Optional for admin"
                  prefix={<Phone size={18} color={colors.textMuted} strokeWidth={1.8} />}
                />
              )}

              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={isSignIn ? "password" : "newPassword"}
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

              {!isSignIn ? (
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
              ) : null}

              {isSignIn ? (
                <View style={styles.forgotRow}>
                  <Pressable
                    onPress={() => router.push("/(auth)/forgot-password")}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password"
                  >
                    <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot password?</Text>
                  </Pressable>
                </View>
              ) : null}

              {error ? (
                <View style={[styles.message, styles.errorBox, { backgroundColor: colors.redSoft, borderColor: colors.dangerBorder }]}>
                  <Text style={[styles.messageText, { color: colors.danger }]}>{error}</Text>
                </View>
              ) : null}

              {info ? (
                <View style={[styles.message, styles.infoBox, { backgroundColor: colors.primarySoft, borderColor: colors.borderLight }]}>
                  <Text style={[styles.messageText, { color: colors.primary }]}>{info}</Text>
                </View>
              ) : null}

              <Button
                title={loading ? "Please wait..." : isSignIn ? "Sign In" : "Create Account"}
                onPress={isSignIn ? handleSignIn : handleSignUp}
                loading={loading}
                disabled={loading}
                fullWidth
                accessibilityLabel={isSignIn ? "Sign In" : "Create Account"}
                style={styles.primaryButton}
              />
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
  scrollOuter: {
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
  toggle: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginBottom: spacing.xl,
    gap: 4,
  },
  toggleOption: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  toggleText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.tight,
  },
  toggleTextActive: {
    fontFamily: fontFamily.pjsBold,
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
  forgotRow: {
    alignItems: "flex-end",
    marginTop: -4,
  },
  forgotText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  message: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorBox: {},
  infoBox: {},
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
});
