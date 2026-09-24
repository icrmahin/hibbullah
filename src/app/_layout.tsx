import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "@expo-google-fonts/sora";
import { useFonts as usePJSFonts } from "@expo-google-fonts/plus-jakarta-sans";
import * as SplashScreen from "expo-splash-screen";
import { AppProviders } from "../providers/AppProviders";
import { useTheme, useThemeColors } from "../providers/ThemeProvider";

SplashScreen.preventAutoHideAsync();

function ThemedStatusBar() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <StatusBar
      barStyle={isDark ? "light-content" : "dark-content"}
      backgroundColor={isDark ? "#111A17" : "#FFFFFF"}
    />
  );
}

function ThemedRootView({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
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
        <ThemedRootView>
          <Stack screenOptions={{ headerShown: false }} />
        </ThemedRootView>
      </AppProviders>
    </SafeAreaProvider>
  );
}