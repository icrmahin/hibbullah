/* eslint-disable react-hooks/set-state-in-effect -- form state syncing requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import SoftHeader from '../../../components/common/SoftHeader';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import Icon from '../../../components/common/Icon';
import { useAuth } from '../../../hooks/useAuth';
import { isValidEmail } from '../../../utils/validation';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Password & Security.
 *
 * This used to be a row in Settings that navigated to the profile editor, so
 * tapping it silently opened a form with no password field on it. It is now its
 * own screen with the two things that actually work against Supabase Auth:
 * change your password, and email yourself a reset link.
 */
export default function SecurityScreen() {
  const colors = useThemeColors();
  const { user, changePassword, sendPasswordResetEmail } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);

  const [resetEmail, setResetEmail] = useState(user?.email ?? '');
  const [sending, setSending] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  // The auth context can still be resolving on the first render, which left the
  // field blank. Filled in once the user arrives, but never over an address the
  // user has already typed.
  useEffect(() => {
    const email = user?.email;
    if (email) setResetEmail((current) => (current ? current : email));
  }, [user?.email]);

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordDone(false);

    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('The new password must be different from the current one.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }

    setChanging(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordDone(true);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Could not change your password.');
    } finally {
      setChanging(false);
    }
  };

  const handleSendReset = async () => {
    setResetError(null);
    setResetDone(false);

    const email = resetEmail.trim();
    if (!isValidEmail(email)) {
      setResetError('Enter the email address on your account.');
      return;
    }
    if (email.toLowerCase() !== (user?.email ?? '').toLowerCase()) {
      setResetError('That is not the email address on this account.');
      return;
    }

    setSending(true);
    try {
      await sendPasswordResetEmail(email);
      setResetDone(true);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Could not send the reset link.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Password & Security" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Section
          icon="lock"
          title="Change password"
          description="You will stay signed in on this device."
        >
          <Input
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            placeholder="Your current password"
          />
          <Input
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />
          <Input
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            placeholder="Repeat the new password"
          />
          {passwordError ? (
            <Text style={[styles.error, { color: colors.danger }]}>{passwordError}</Text>
          ) : null}
          {passwordDone ? (
            <Text style={[styles.success, { color: colors.success }]}>Password changed.</Text>
          ) : null}
          <Button
            title={changing ? 'Updating...' : 'Update password'}
            onPress={handleChangePassword}
            loading={changing}
            disabled={changing}
            fullWidth
          />
        </Section>

        <Section
          icon="mail"
          title="Forgot your password?"
          description="We will email you a link that lets you set a new one."
        >
          <Input
            label="Email"
            value={resetEmail}
            onChangeText={setResetEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
          />
          {resetError ? <Text style={[styles.error, { color: colors.danger }]}>{resetError}</Text> : null}
          {resetDone ? (
            <Text style={[styles.success, { color: colors.success }]}>
              Check {user?.email} for the reset link.
            </Text>
          ) : null}
          <Button
            title={sending ? 'Sending...' : 'Email me a reset link'}
            onPress={handleSendReset}
            loading={sending}
            disabled={sending}
            variant="secondary"
            fullWidth
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
          <Icon name={icon} size={16} color={colors.primary} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.cardDescription, { color: colors.textMuted }]}>{description}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardHeaderText: { flex: 1, gap: 2 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: typography.bodySmall, fontWeight: '700' },
  cardDescription: { fontSize: typography.caption },
  cardBody: { gap: spacing.md },
  error: { fontSize: typography.caption },
  success: { fontSize: typography.caption },
});
