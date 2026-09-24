import { Redirect } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { ActivityIndicator, View } from "react-native";

export default function AppIndex() {
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

  // Admin can use both shop and admin with no restriction — default to shop.
  // Admin can navigate to /(admin) via Shop→Admin button; customer restricted to shop by AdminLayout guard.
  return <Redirect href="/(customer)/(tabs)" />;
}
