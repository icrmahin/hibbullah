/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import Input from '../../../components/common/Input';
import PhoneInput from '../../../components/common/PhoneInput';
import AvatarPicker from '../../../components/common/AvatarPicker';
import Button from '../../../components/common/Button';
import LoadingState from '../../../components/common/LoadingState';
import { useAuth } from '../../../hooks/useAuth';
import { useConfirm } from '../../../hooks/useConfirm';
import { useBottomInset } from '../../../hooks/useBottomInset';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { setAvatarUrl, updateProfile } from '../../../services/profile';
import { deleteCloudinaryAsset, publicIdFromUrl, uploadAvatarImage } from '../../../services/storage';
import { formatBdPhone, normalizeBdPhone } from '../../../utils/phone';
import spacing from '../../../constants/spacing';
import { radius } from '../../../constants/sizes';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';

/**
 * The single place a profile is edited.
 *
 * Settings used to have two entries pointing here — a "Profile Details" row and
 * a top card — and "Password & Security" pointed here too, so tapping it opened
 * this form. There is now exactly one profile entry (the top card), and
 * passwords live in their own screen.
 */
export default function ProfileScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { user, loading, refreshUser } = useAuth();
  const { confirm, confirmDialogProps } = useConfirm();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setPhone(user.phone ?? '');
    }
  }, [user]);

  if (loading && !user) {
    return (
      <Screen header={<ScreenHeader title="Profile" onBack={goBack} />}>
        <LoadingState label="Loading profile..." />
      </Screen>
    );
  }

  /**
   * Uploaded immediately rather than on save, so there is no local file left dangling
   * if the user backs out.
   *
   * Each upload gets its own Cloudinary public id, because an unsigned upload cannot
   * replace an existing asset, so the picture being superseded is destroyed explicitly.
   * That cleanup is best-effort and runs *after* the row is updated: the database is
   * the source of truth, and a failed cleanup must never cost the user the picture
   * they just chose.
   */
  const handlePickAvatar = async (localUri: string) => {
    if (!user) return;
    const previousUrl = user.avatar ?? null;
    setAvatarError(null);
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatarImage(localUri, user.id);
      await setAvatarUrl(user.id, url);
      await refreshUser();
      if (previousUrl) {
        const previousPublicId = publicIdFromUrl(previousUrl);
        if (previousPublicId) {
          await deleteCloudinaryAsset({ scope: 'avatar', previousPublicId });
        }
      }
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Could not upload the photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.avatar) return;

    // Was `Alert.alert(..., [{ onPress: () => void (async () => { ... })() }])`, which on
    // web does nothing: react-native-web's Alert is `static alert() {}`, so the onPress
    // that removes the picture never ran. It also wrapped the work in a `void (async …)()`
    // inside a callback, so a failure had nowhere to surface except a setState that the
    // early return could preempt. Awaiting the confirmation instead puts the work in the
    // handler's own try/catch, where the existing `avatarError` is already wired up.
    setAvatarError(null);
    const ok = await confirm({
      title: 'Remove profile picture?',
      message: 'Your account will show your initials instead.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;

    try {
      await setAvatarUrl(user.id, null);
      await refreshUser();
      // Best-effort: the database row is the source of truth, so a
      // failure here must not block the removal the user asked for.
      await deleteCloudinaryAsset({ scope: 'avatar' });
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Could not remove the photo.');
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }

    const digits = phone.trim();
    let canonicalPhone: string | null = null;
    if (digits) {
      const parsed = normalizeBdPhone(digits);
      if (!parsed.ok || !parsed.e164) {
        setError(parsed.error ?? 'Enter a valid Bangladeshi phone number.');
        return;
      }
      canonicalPhone = parsed.e164;
    }

    if (!user) {
      setError('Not signed in.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(user.id, { name: trimmedName, phone: canonicalPhone });
      setPhone(canonicalPhone ?? '');
      await refreshUser();
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Profile" onBack={goBack} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <AvatarPicker
            uri={user?.avatar}
            name={user?.name}
            uploading={uploadingAvatar}
            onPick={handlePickAvatar}
            onRemove={handleRemoveAvatar}
            error={avatarError}
          />

          <View style={[styles.separator, { backgroundColor: colors.borderSoft }]} />

          <Input label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input label="Email" value={user?.email ?? ''} editable={false} />
          <PhoneInput
            value={phone}
            onChangeDigits={setPhone}
            hint={
              user?.phone
                ? `Saved as ${formatBdPhone(user.phone)}`
                : 'Optional. Used for delivery updates.'
            }
          />
        </View>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {success ? <Text style={[styles.success, { color: colors.success }]}>Profile updated.</Text> : null}
        <Button
          title={saving ? 'Saving...' : 'Save changes'}
          onPress={handleSave}
          loading={saving}
          disabled={saving || uploadingAvatar}
          fullWidth
        />
      </ScrollView>
      <ConfirmDialog {...confirmDialogProps} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  // The form is one white card on the off-white page — the lightness step is the border.
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  separator: { height: 1, marginVertical: spacing.xs },
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: 'center',
  },
  success: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: 'center',
  },
});
