import { router } from "expo-router";
import { goBack } from '@/utils/navigation';
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors, useTheme } from "../../../providers/ThemeProvider";
import { useAuth } from "../../../hooks/useAuth";
import SoftHeader from "../../../components/common/SoftHeader";
import Icon from "../../../components/common/Icon";
import ListItem from "../../../components/common/ListItem";
import Toggle from "../../../components/common/Toggle";
import spacing from "../../../constants/spacing";
import { radius } from "../../../constants/sizes";

export default function CustomerSettingsScreen() {
  const colors = useThemeColors();
  const { themeMode, setThemeMode } = useTheme();
  const { signOut } = useAuth();
  const isDark = themeMode === "dark";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Settings" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.sectionGroup, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <ListItem title="Profile Details" left={<Icon name="person" size={20} color={colors.primary} />} onPress={() => router.push("/(customer)/account/profile")} divider />
          <ListItem title="Addresses" left={<Icon name="place" size={20} color={colors.primary} />} onPress={() => router.push("/(customer)/account/addresses")} divider />
          <ListItem title="Notifications" left={<Icon name="notifications" size={20} color={colors.primary} />} onPress={() => router.push("/(customer)/account/notifications")} divider />
          <ListItem title="Dark Mode" left={<Icon name="dark-mode" size={20} color={colors.primary} />} right={<Toggle value={isDark} onValueChange={(v) => setThemeMode(v ? "dark" : "light")} size="sm" />} />
        </View>
        <View style={[styles.sectionGroup, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <ListItem title="Log Out" left={<Icon name="logout" size={20} color={colors.danger} />} onPress={() => signOut()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  sectionGroup: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
});
