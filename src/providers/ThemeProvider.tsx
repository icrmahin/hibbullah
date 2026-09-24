import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import colors from "../constants/colors";
import { darkColors } from "../constants/darkColors";

const THEME_KEY = "hibbullah-theme";

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeModeState(stored);
      }
      setIsReady(true);
    }).catch(() => {
      setIsReady(true);
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
  }, []);

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
