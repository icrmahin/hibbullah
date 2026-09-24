import { type ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { CartProvider } from "./CartProvider";
import { FavoritesProvider } from "./FavoritesProvider";
import { ThemeProvider } from "./ThemeProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <FavoritesProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </FavoritesProvider>
      </CartProvider>
    </AuthProvider>
  );
}
