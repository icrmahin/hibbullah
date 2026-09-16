import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AuthSession, Role } from "../types/auth";
import type { User } from "../types/user";
import type { Database } from "../types/database";
import { store } from "./mockData";

WebBrowser.maybeCompleteAuthSession();

export async function resolveAuthSession(
  sbSession: Session,
): Promise<{ authSession: AuthSession; user: User }> {
  const sbUser = sbSession.user;
  let profile: Database["public"]["Tables"]["profiles"]["Row"] | null = null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", sbUser.id)
      .maybeSingle();

    if (!error && data) {
      profile = data;
    }
  } catch (err) {
    console.warn("Could not query profiles table:", err);
  }

  const mock = store.users.find(
    (u) =>
      u.id === sbUser.id ||
      (sbUser.email && u.email?.toLowerCase() === sbUser.email.toLowerCase()),
  );

  const role: Role =
    profile?.role ??
    (sbUser.app_metadata?.role as Role) ??
    (sbUser.user_metadata?.role as Role) ??
    mock?.role ??
    (sbUser.email?.toLowerCase() === "admin@hibbullah.app" ||
    sbUser.email?.toLowerCase().startsWith("admin@")
      ? "admin"
      : "customer");

  const name: string =
    profile?.name ||
    sbUser.user_metadata?.full_name ||
    sbUser.user_metadata?.name ||
    mock?.name ||
    sbUser.email?.split("@")[0] ||
    "Customer";

  const phone: string =
    profile?.phone ||
    sbUser.phone ||
    sbUser.user_metadata?.phone ||
    mock?.phone ||
    "";

  const email: string | undefined =
    sbUser.email || profile?.email || mock?.email || undefined;

  const avatar: string | undefined =
    sbUser.user_metadata?.avatar_url ||
    sbUser.user_metadata?.picture ||
    mock?.avatar ||
    undefined;

  const createdAt: string =
    profile?.created_at ||
    sbUser.created_at ||
    mock?.createdAt ||
    new Date().toISOString();

  if (!profile) {
    try {
      await supabase.from("profiles").upsert({
        id: sbUser.id,
        name,
        email: email ?? null,
        phone,
        role,
      });
    } catch {
      // Non-fatal if upsert fails
    }
  }

  const user: User = {
    id: sbUser.id,
    name,
    email,
    phone,
    role,
    avatar,
    createdAt,
  };

  const authSession: AuthSession = {
    id: sbSession.access_token ? `session-${sbUser.id}` : sbUser.id,
    userId: sbUser.id,
    role,
    email,
    phone,
  };

  return { authSession, user };
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!error && profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email ?? undefined,
        phone: profile.phone,
        role: profile.role,
        createdAt: profile.created_at,
      };
    }
  } catch (err) {
    console.warn("Could not fetch user by ID from Supabase:", err);
  }

  const mock = store.users.find((u) => u.id === userId);
  return mock ?? null;
}

export const authService = {
  async signInWithGoogle() {
    try {
      const redirectUrl = makeRedirectUri({
        scheme: "hibbullah",
        path: "auth/callback",
      });

      console.log("OAuth redirect URL:", redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.error("Supabase OAuth error:", error);
        throw error;
      }

      if (!data?.url) {
        throw new Error("No OAuth URL returned from Supabase.");
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      console.log("OAuth browser result:", result);

      if (result.type !== "success" || !result.url) {
        throw new Error(
          `Google authentication was cancelled or failed: ${result.type}`
        );
      }

      const callbackUrl = new URL(result.url);

      console.log(
        "OAuth callback URL:",
        callbackUrl.toString()
      );

      // Check OAuth callback errors
      const callbackError =
        callbackUrl.searchParams.get("error");

      const callbackErrorCode =
        callbackUrl.searchParams.get("error_code");

      const callbackErrorDescription =
        callbackUrl.searchParams.get("error_description");

      if (
        callbackError ||
        callbackErrorCode ||
        callbackErrorDescription
      ) {
        throw new Error(
          `OAuth failed: ${callbackError || "unknown"} | ${
            callbackErrorCode || "no_code"
          } | ${
            callbackErrorDescription || "no_description"
          }`
        );
      }

      // Check tokens returned in hash fragment
      const hashParams = new URLSearchParams(
        callbackUrl.hash.replace(/^#/, "")
      );

      const accessToken =
        hashParams.get("access_token");

      const refreshToken =
        hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          throw sessionError;
        }

        return sessionData;
      }

      // Check if Supabase already created a session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (session) {
        return {
          session,
          user: session.user,
        };
      }

      throw new Error(
        "Google authentication completed, but no Supabase session was found."
      );
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      throw error;
    }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }
  },

  getUserById,
  resolveAuthSession,
};