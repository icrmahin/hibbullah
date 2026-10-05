import { Redirect, Stack } from "expo-router";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import AdminNavigation from "../../components/admin/AdminNavigation";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../hooks/useAuth";

export default function AdminLayout() {
  const { isMobile } = useResponsive();
  const { session, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!isAdmin) {
    return <Redirect href="/(customer)/(tabs)" />;
  }

  return (
    <View style={[styles.container, !isMobile && styles.containerRow]}>
      {!isMobile && <AdminSidebar />}
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          {/*
            `products` only. It has its own `products/_layout.tsx`, which makes the whole
            directory ONE child of this navigator — so `products/add`,
            `products/[productId]` and `products/[productId]/edit` belong to the *nested*
            stack and declaring them here can never match (Expo Router warns
            "No route named ... exists in nested children"). The groups below have no
            layout of their own, which is why their names are spelled out in full and
            resolve.
          */}
          <Stack.Screen name="products" />
          <Stack.Screen name="inventory" />
          <Stack.Screen name="inventory/batches" />
          <Stack.Screen name="inventory/expiry" />
          <Stack.Screen name="inventory/adjustment" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="orders/[orderId]" />
          <Stack.Screen name="customers" />
          <Stack.Screen name="customers/[customerId]" />
          <Stack.Screen name="reports" />
          <Stack.Screen name="reports/sales" />
          <Stack.Screen name="reports/inventory" />
          <Stack.Screen name="returns" />
          <Stack.Screen name="returns/[returnId]" />
          <Stack.Screen name="audit" />
          {/*
            Same shape as `orders`: no `_layout.tsx` inside the directory, so these three
            are direct children of this stack and are declared in full. `advertisements`
            covers the list because `child.route === name + "/index"` matches.
          */}
          <Stack.Screen name="advertisements" />
          <Stack.Screen name="advertisements/add" />
          <Stack.Screen name="advertisements/[adId]" />
        </Stack>
      </View>
      {isMobile && <AdminNavigation />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerRow: { flexDirection: "row" },
  content: { flex: 1 },
});
