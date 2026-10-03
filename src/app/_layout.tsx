import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "@expo-google-fonts/sora";
import { useFonts as usePJSFonts } from "@expo-google-fonts/plus-jakarta-sans";
import * as SplashScreen from "expo-splash-screen";
import { AppProviders } from "../providers/AppProviders";
import AppErrorBoundary from "../components/common/ErrorBoundary";
import { useTheme, useThemeColors } from "../providers/ThemeProvider";
import { usePushNotifications } from "../hooks/usePushNotifications";

SplashScreen.preventAutoHideAsync();

function ThemedStatusBar() {
  const { resolvedTheme } = useTheme();
  const colors = useThemeColors();
  const isDark = resolvedTheme === "dark";

  return (
    <StatusBar
      barStyle={isDark ? "light-content" : "dark-content"}
      // From the palette rather than a hex literal. This was `#111A17`, which was a copy of
      // the dark background that had already gone stale once — the real value is now
      // `#0A0C0B`, so the status bar would have been a visibly lighter band above a
      // near-black app, and nothing would have said so.
      backgroundColor={colors.background}
    />
  );
}

function ThemedRootView({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
}

/**
 * Renders nothing. It exists so device-push registration and tap-routing live in one
 * place at the top of the tree, inside AppProviders (the hook reads the auth session to
 * know which account this phone currently belongs to) and alongside the Stack (so a
 * notification tap can navigate the moment it is observed).
 */
function PushNotificationsHost() {
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  const [soraLoaded] = useFonts({
    Sora_400Regular: require("@expo-google-fonts/sora/400Regular/Sora_400Regular.ttf"),
    Sora_500Medium: require("@expo-google-fonts/sora/500Medium/Sora_500Medium.ttf"),
    Sora_600SemiBold: require("@expo-google-fonts/sora/600SemiBold/Sora_600SemiBold.ttf"),
    Sora_700Bold: require("@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf"),
  });

  const [pjsLoaded] = usePJSFonts({
    PlusJakartaSans_400Regular: require("@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf"),
    PlusJakartaSans_500Medium: require("@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf"),
    PlusJakartaSans_600SemiBold: require("@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf"),
    PlusJakartaSans_700Bold: require("@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf"),
  });

  useEffect(() => {
    if (soraLoaded && pjsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [soraLoaded, pjsLoaded]);

  if (!soraLoaded || !pjsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppProviders>
        <ThemedStatusBar />
        <PushNotificationsHost />
        <ThemedRootView>
          {/* Inside AppProviders so the fallback can read the theme, and around the
              Stack so a throw in any screen shows this instead of ending the process. */}
          <AppErrorBoundary>
            <Stack screenOptions={{ headerShown: false }} />
          </AppErrorBoundary>
        </ThemedRootView>
      </AppProviders>
    </SafeAreaProvider>
  );
}