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
          <Stack.Screen name="products" />
          <Stack.Screen name="products/[productId]" />
          <Stack.Screen name="products/[productId]/edit" />
          <Stack.Screen name="products/add" />
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
