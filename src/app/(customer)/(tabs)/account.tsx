import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";

export default function AccountScreen() {
  const router = useRouter();
  const { isAdmin, user, signOut } = useAuth();

  // User avatar display initial logic
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : "T";

  return (
    <ScrollView style={styles.container}>
      {/* Title Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.subtitle}>Your personal preferences</Text>
      </View>

      {/* User Info Card */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name || "tahsin zidane"}</Text>
          <Text style={styles.userEmail}>{user?.email || "dev.tahsinzidane@gmail.com"}</Text>
        </View>
      </View>

      {/* Account Menu Options */}
      <View style={styles.menuGroup}>
        {/* Only visible if logged in user is Admin */}
        {isAdmin && (
          <TouchableOpacity
            style={styles.optionButton}
            onPress={() => router.push("/(customer)/account/dashboard")}
          >
            <Text style={styles.optionText}>Dashboard</Text>
          </TouchableOpacity>
        )}

        {/* Standard Options for all users */}
        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => router.push("/(customer)/account/profile")}
        >
          <Text style={styles.optionText}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => router.push("/(customer)/account/addresses" as any)}
        >
          <Text style={styles.optionText}>Addresses</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => router.push("/(customer)/account/notifications" as any)}
        >
          <Text style={styles.optionText}>Notifications</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => router.push("/(customer)/account/settings" as any)}
        >
          <Text style={styles.optionText}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#064e3b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  userEmail: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  menuGroup: {
    gap: 10,
  },
  optionButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  logoutButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#064e3b",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 32,
  },
  logoutText: {
    color: "#064e3b",
    fontSize: 15,
    fontWeight: "700",
  },
});