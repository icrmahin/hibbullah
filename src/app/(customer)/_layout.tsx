import { Redirect, Stack } from "expo-router";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import CustomerNavigation from "../../components/common/CustomerNavigation";
import CustomerDesktopHeader from "../../components/common/CustomerDesktopHeader";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../hooks/useAuth";

export default function CustomerLayout() {
  const { isMobile } = useResponsive();
  const { session, loading } = useAuth();

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

  // Admin can use shop with no restriction — do not redirect isAdmin to /(admin).
  // Customer is restricted to shop; AdminLayout will block non-admin from /(admin).

  return (
    <View style={styles.container}>
      {!isMobile && <CustomerDesktopHeader />}
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="search" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="delivery-cycle" />
          <Stack.Screen name="order/[orderId]" />
          <Stack.Screen name="products" />
          <Stack.Screen name="account" />
          <Stack.Screen name="address" />
        </Stack>
      </View>
      {isMobile && <CustomerNavigation />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
});
