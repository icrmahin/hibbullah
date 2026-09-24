import { Tabs } from "expo-router";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Icon from "../../../components/common/Icon";

export default function CustomerTabsLayout() {
  const colors = useThemeColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Icon name="home" size={22} color={color} /> }} />
      <Tabs.Screen name="cart" options={{ title: "Cart", tabBarIcon: ({ color }) => <Icon name="shopping-cart" size={22} color={color} /> }} />
      <Tabs.Screen name="favorites" options={{ title: "Favorites", tabBarIcon: ({ color }) => <Icon name="favorite" size={22} color={color} /> }} />
      {/* Products catalogue — not a bottom-tab, but keep as stack-navigable (Home → View all) */}
      <Tabs.Screen name="products" options={{ href: null, title: "Products" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color }) => <Icon name="receipt-long" size={22} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "Settings", tabBarIcon: ({ color }) => <Icon name="settings" size={22} color={color} /> }} />
    </Tabs>
  );
}
