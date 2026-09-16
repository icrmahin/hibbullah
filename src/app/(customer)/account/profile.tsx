import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Header from '../../../components/common/Header';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import LoadingState from '../../../components/common/LoadingState';
import colors from '../../../constants/colors';
import spacing from '../../../constants/spacing';
import { useAuth } from '../../../hooks/useAuth';
import { mockUser } from '../../../services/mockData';

export default function ProfileScreen() {
  const { user, loading } = useAuth();
  const [name, setName] = useState(user?.name ?? mockUser.name);
  const [email, setEmail] = useState(user?.email ?? mockUser.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? mockUser.phone ?? '');

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  if (loading) {
    return <LoadingState label="Loading profile..." />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header title="Profile" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Input label="Full name" value={name} onChangeText={setName} />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <Button
          title="Save changes"
          variant="secondary"
          onPress={() => router.back()}
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { gap: spacing.md },
});

