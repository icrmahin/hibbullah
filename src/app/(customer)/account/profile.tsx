/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import SoftHeader from '../../../components/common/SoftHeader';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import LoadingState from '../../../components/common/LoadingState';
import { useAuth } from '../../../hooks/useAuth';
import { updateProfile } from '../../../services/profile';
import spacing from '../../../constants/spacing';

export default function ProfileScreen() {
  const colors = useThemeColors();
  const { user, loading, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setPhone(user.phone ?? "");
    }
  }, [user]);

  if (loading && !user) {
    return <LoadingState label="Loading profile..." />;
  }

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (phone.trim() && !/^\+?8801[0-9]{9}$/.test(phone.trim())) {
      setError('Phone must be Bangladeshi format +8801XXXXXXXXX (e.g. +8801865858544).');
      return;
    }
    if (!user) {
      setError('Not signed in.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(user.id, { name: name.trim(), phone: phone.trim() || null });
      await refreshUser();
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Profile" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Input label="Full name" value={name} onChangeText={setName} />
          <Input label="Email" value={user?.email ?? ""} editable={false} />
          <Input label="Phone (+880...)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </View>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {success ? <Text style={[styles.success, { color: colors.success }]}>Profile updated.</Text> : null}
        <Button title={saving ? "Saving..." : "Save changes"} onPress={handleSave} loading={saving} disabled={saving} fullWidth />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { gap: spacing.md },
  error: { fontSize: 12, textAlign: 'center' },
  success: { fontSize: 12, textAlign: 'center' },
});
