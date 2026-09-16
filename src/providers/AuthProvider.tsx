import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  AuthContextType,
  AuthSession,
  LoginForm,
  RegisterForm,
} from "../types/auth";
import type { User } from "../types/user";
import {
  authService,
  getUserById,
  resolveAuthSession,
} from "../services/authService";
import { clearSession, saveSession } from "../lib/session";
import { supabase } from "../lib/supabase";

export type AuthContextValue = AuthContextType;

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Verifies whether the specified email exists in the Supabase admin_users table.
 * Uses case-insensitive matching for ultimate security and reliability.
 */
async function verifyAdminStatus(email?: string | null): Promise<boolean> {
  if (!email) return false;

  try {
    const cleanEmail = email.trim().toLowerCase();

    // Perform case-insensitive email match in Supabase
    const { data, error } = await supabase
      .from("admin_users")
      .select("email")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (error) {
      console.error("Admin verification database error:", error.message);
      return false;
    }

    return Boolean(data && data.email.trim().toLowerCase() === cleanEmail);
  } catch (err) {
    console.error("Failed to verify admin status:", err);
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Helper function to reset all user states securely
  const resetAuthState = useCallback(async () => {
    await clearSession();
    setSession(null);
    setUser(null);
    setIsAdmin(false);
  }, []);

  const syncSession = useCallback(
    async (sbSession?: Session | null): Promise<AuthSession | null> => {
      let targetSession = sbSession;
      if (!targetSession) {
        const { data } = await supabase.auth.getSession();
        targetSession = data.session;
      }

      if (!targetSession?.user) {
        await resetAuthState();
        return null;
      }

      const userEmail = targetSession.user.email;
      const [isAdminUser, resolved] = await Promise.all([
        verifyAdminStatus(userEmail),
        resolveAuthSession(targetSession),
      ]);

      const { authSession, user: profile } = resolved;
      
      // Strict Role Override
      authSession.isAdmin = isAdminUser;
      authSession.role = isAdminUser ? "admin" : "customer";
      profile.role = isAdminUser ? "admin" : "customer";

      await saveSession(authSession);
      setSession(authSession);
      setUser(profile);
      setIsAdmin(isAdminUser);
      return authSession;
    },
    [resetAuthState]
  );

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const {
          data: { session: sbSession },
        } = await supabase.auth.getSession();

        if (sbSession?.user) {
          const userEmail = sbSession.user.email;
          const [isAdminUser, resolved] = await Promise.all([
            verifyAdminStatus(userEmail),
            resolveAuthSession(sbSession),
          ]);

          const { authSession, user: profile } = resolved;
          authSession.isAdmin = isAdminUser;
          authSession.role = isAdminUser ? "admin" : "customer";
          profile.role = isAdminUser ? "admin" : "customer";

          if (isMounted) {
            await saveSession(authSession);
            setSession(authSession);
            setUser(profile);
            setIsAdmin(isAdminUser);
          }
        } else {
          // Forcefully clear stale local storage if no active Supabase session
          if (isMounted) {
            await resetAuthState();
          }
        }
      } catch (err) {
        console.error("Failed to initialize auth session:", err);
        if (isMounted) {
          await resetAuthState();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
      if (event === "SIGNED_OUT" || !sbSession?.user) {
        if (isMounted) {
          await resetAuthState();
          setLoading(false);
        }
      } else if (sbSession?.user) {
        try {
          const userEmail = sbSession.user.email;
          const [isAdminUser, resolved] = await Promise.all([
            verifyAdminStatus(userEmail),
            resolveAuthSession(sbSession),
          ]);

          const { authSession, user: profile } = resolved;
          authSession.isAdmin = isAdminUser;
          authSession.role = isAdminUser ? "admin" : "customer";
          profile.role = isAdminUser ? "admin" : "customer";

          if (isMounted) {
            await saveSession(authSession);
            setSession(authSession);
            setUser(profile);
            setIsAdmin(isAdminUser);
            setLoading(false);
          }
        } catch (err) {
          console.error("Failed to resolve auth session on state change:", err);
          if (isMounted) {
            await resetAuthState();
            setLoading(false);
          }
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [resetAuthState]);

  const login = useCallback(async (_form: LoginForm): Promise<AuthSession> => {
    throw new Error("Manual login is disabled. Please use Google login.");
  }, []);

  const register = useCallback(
    async (_form: RegisterForm): Promise<AuthSession> => {
      throw new Error(
        "Manual registration is disabled. Please use Google login.",
      );
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } catch (err) {
      console.error("Error signing out from Supabase:", err);
    }
    await resetAuthState();
  }, [resetAuthState]);

  const refreshUser = useCallback(async () => {
    if (!session) return;
    const profile = await getUserById(session.userId);
    setUser(profile ?? null);
  }, [session]);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      isAdmin,
      loading,
      signOut,
      logout: signOut,
      login,
      register,
      refreshUser,
      syncSession,
    }),
    [
      session,
      user,
      isAdmin,
      loading,
      signOut,
      login,
      register,
      refreshUser,
      syncSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}