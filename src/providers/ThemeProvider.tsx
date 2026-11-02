import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthProvider";
import colors from "../constants/colors";
import { darkColors } from "../constants/darkColors";

const LEGACY_THEME_KEY = "hibbullah-theme";
const userThemeKey = (uid: string) => `hibbullah-theme:${uid}`;

type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  resolvedTheme: "light" | "dark";
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  resolvedTheme: "light",
  themeMode: "light",
  setThemeMode: () => {},
  toggleTheme: () => {},
  isReady: false,
});

function resolveTheme(mode: ThemeMode, systemScheme: string | null): "light" | "dark" {
  if (mode === "system") {
    return systemScheme === "dark" ? "dark" : "light";
  }
  return mode;
}

function isStoredMode(v: string | null): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [isReady, setIsReady] = useState(false);

  // First paint: the legacy device-global default (or light when unset).
  useEffect(() => {
    AsyncStorage.getItem(LEGACY_THEME_KEY).then((stored) => {
      if (isStoredMode(stored)) {
        setThemeModeState(stored);
      }
      setIsReady(true);
    }).catch(() => {
      setIsReady(true);
    });
  }, []);

  // Per-user override: when the signed-in account changes, that account's stored
  // choice wins. Accounts without one keep whatever the default currently is.
  // Logged-out keeps the current theme rather than resetting the screen.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(userThemeKey(userId)).then((stored) => {
      if (!cancelled && isStoredMode(stored)) {
        setThemeModeState(stored);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    // The account's choice when signed in, so it stays for that user; the
    // device-global default is kept in step as the logged-out fallback.
    if (userId) {
      AsyncStorage.setItem(userThemeKey(userId), mode).catch(() => {});
    }
    AsyncStorage.setItem(LEGACY_THEME_KEY, mode).catch(() => {});
  }, [userId]);

  const resolved = resolveTheme(themeMode, systemScheme);

  const toggleTheme = useCallback(() => {
    const next = resolved === "light" ? "dark" : "light";
    setThemeMode(next);
  }, [resolved, setThemeMode]);

  const value = useMemo<ThemeContextValue>(() => ({
    resolvedTheme: resolved,
    themeMode,
    setThemeMode,
    toggleTheme,
    isReady,
  }), [resolved, themeMode, setThemeMode, toggleTheme, isReady]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeColors() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? darkColors : colors;
}
