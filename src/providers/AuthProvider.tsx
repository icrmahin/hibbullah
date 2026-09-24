import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import * as Linking from 'expo-linking'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types/user'
import type { AuthSession, AuthContextType, LoginForm, RegisterForm } from '../types/auth'

type VerifyOtpType = 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change' | 'email'

// Production allowlist — must match DB is_admin() allowlist exactly
const ADMIN_EMAILS = new Set(['icrmahin@gmail.com', 'hibbullah82026@gmail.com'])

function isEmailAllowlisted(email?: string | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.has(email.trim().toLowerCase())
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await handleSessionChange(session as Session | null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await handleSessionChange(session as Session | null)
    })

    // Deep-link handling for email confirmation and password recovery (standalone Android via hibbullah://)
    const handleUrl = async (url: string | null) => {
      if (!url) return
      try {
        const parsed = Linking.parse(url)
        const query = parsed.queryParams as Record<string, string> | null
        // PKCE code flow (Supabase emails with ?code=...)
        const code = query?.code as string | undefined
        const token_hash = query?.token_hash as string | undefined
        const type = query?.type as string | undefined
        const error_code = query?.error_code as string | undefined
        if (error_code) {
          // let UI surface via onAuthStateChange error handling
          return
        }
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(url)
          if (error) console.warn('[AuthProvider] exchangeCodeForSession error', error.message)
        } else if (token_hash && type) {
          // legacy token_hash flow (recovery, signup, email_change)
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as VerifyOtpType })
          if (error) console.warn('[AuthProvider] verifyOtp error', error.message)
        } else {
          // Handle case where url contains access_token in hash (implicit flow fallback)
          const hash = url.split('#')[1]
          if (hash) {
            const params = new URLSearchParams(hash)
            const access_token = params.get('access_token')
            const refresh_token = params.get('refresh_token')
            if (access_token && refresh_token) {
              await supabase.auth.setSession({ access_token, refresh_token })
            }
          }
        }
      } catch (e) {
        console.warn('[AuthProvider] handleUrl error', e)
      }
    }

    Linking.getInitialURL().then(handleUrl)
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url))

    return () => {
      subscription.unsubscribe()
      sub.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // FIX: handleSessionChange/fetchProfile/checkIsAdminRpc remain plain (hoisted) function
  // declarations. The first fix attempt converted them into useCallback chains, which tripped the
  // react-hooks compiler rules — the session effect below references handleSessionChange earlier
  // in the body, and a const there is a TDZ access ("accessed before it is declared") that also
  // makes the compiler drop the memoization (preserve-manual-memoization). Hoisted function
  // declarations keep the deep-link effect working exactly as before. refreshUser's [] deps are
  // safe for the same reason — see the note at refreshUser.
  async function fetchProfile(userId: string): Promise<{ name?: string | null; phone?: string | null; avatar_url?: string | null; role?: 'customer' | 'admin' | null } | null> {
    try {
      const { data, error } = await supabase.from('profiles').select('name, phone, avatar_url, role').eq('id', userId).single()
      if (error || !data) return null
      return data as { name?: string | null; phone?: string | null; avatar_url?: string | null; role?: 'customer' | 'admin' | null }
    } catch {
      return null
    }
  }

  async function checkIsAdminRpc(): Promise<boolean | null> {
    try {
      const { data, error } = await supabase.rpc('is_admin')
      if (error) return null
      return data === true
    } catch {
      return null
    }
  }

  async function handleSessionChange(session: Session | null) {
    if (session?.user) {
      const email = session.user.email as string | undefined
      // Phone source of truth is profiles.phone (not auth) — auth only for gmail, phone required for placing order
      const profile = await fetchProfile(session.user.id)
      const profileRole = (profile?.role as 'customer' | 'admin' | null) ?? null
      // DB truth via RPC (when available) otherwise fallback to email allowlist
      const rpcAdmin = await checkIsAdminRpc()
      const emailAdmin = isEmailAllowlisted(email)

      // If RPC available, trust it; else use email allowlist (same as DB). Profiles role is NOT trusted for admin.
      const hardenedIsAdmin = rpcAdmin !== null ? rpcAdmin : emailAdmin
      // Keep role for display but ensure isAdmin follows hardened truth
      const displayRole: 'customer' | 'admin' = hardenedIsAdmin ? 'admin' : 'customer'
      // Log mismatch for observability (customer with profiles.role admin should not be admin)
      if (profileRole === 'admin' && !hardenedIsAdmin) {
        console.warn('[AuthProvider] blocked admin impersonation: profiles.role=admin but email not allowlisted', email)
      }

      const profilePhone = profile?.phone ?? ''
      const profileName = profile?.name ?? (session.user.user_metadata?.name as string | undefined) ?? session.user.email?.split('@')[0] ?? 'User'
      const profileAvatar = profile?.avatar_url ?? (session.user.user_metadata?.avatar_url as string | undefined)

      const sessionWithId = session as Session & { id?: string }
      const authSession: AuthSession = {
        id: sessionWithId.id || session.access_token?.slice(0, 8) || '',
        userId: session.user.id || '',
        role: displayRole,
        email: email || undefined,
        phone: profilePhone || undefined,
        isAdmin: hardenedIsAdmin,
      }
      setSession(authSession)
      setIsAdmin(hardenedIsAdmin)

      const appUser: User = {
        id: session.user.id || '',
        name: profileName as string,
        email: session.user.email || undefined,
        phone: profilePhone,
        role: displayRole,
        avatar: profileAvatar,
        createdAt: session.user.created_at || new Date().toISOString(),
      }
      setUser(appUser)
    } else {
      setSession(null)
      setUser(null)
      setIsAdmin(false)
    }
  }

  const login = useCallback(async (form: LoginForm): Promise<AuthSession> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    if (error) throw new Error(error.message)
    if (!data.session || !data.user) {
      throw new Error('No session returned. If you just signed up, check your email for confirmation.')
    }
    const email = data.user.email
    const hardenedIsAdmin = isEmailAllowlisted(email)
    // Also verify via RPC after session established (best effort)
    let rpcAdmin: boolean | null = null
    try {
      const r = await supabase.rpc('is_admin')
      if (!r.error) rpcAdmin = r.data === true
    } catch {}
    const finalIsAdmin = rpcAdmin !== null ? rpcAdmin : hardenedIsAdmin
    const role: 'customer' | 'admin' = finalIsAdmin ? 'admin' : 'customer'
    const sessWithId = data.session as Session & { id?: string }
    return {
      id: sessWithId.id || '',
      userId: data.user.id || '',
      role,
      email: data.user.email,
      phone: data.user.phone,
      isAdmin: finalIsAdmin,
    }
  }, [])

  const register = useCallback(async (form: RegisterForm): Promise<AuthSession> => {
    const emailRedirectTo = Linking.createURL('auth-callback')
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          name: form.name,
          phone: form.phone,
          role: 'customer',
        },
        emailRedirectTo,
      },
    })
     if (error) throw new Error(error.message)
    if (!data.user) throw new Error('No user returned')
    // Simple flow: no email confirmation required. If session exists, return it; if not (hosted still has confirmations enabled), fallback to user without session so caller can sign in directly.
     if (data.session) {
       const sessWithId = data.session as Session & { id?: string }
       return {
         id: sessWithId.id || '',
         userId: data.user.id || '',
         role: 'customer',
         email: data.user.email,
         phone: form.phone,
         isAdmin: isEmailAllowlisted(data.user.email),
       }
     }
     return {
       id: '',
       userId: data.user.id || '',
       role: 'customer',
       email: data.user.email,
       phone: form.phone,
       isAdmin: isEmailAllowlisted(data.user.email),
     }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
    setSession(null)
    setUser(null)
    setIsAdmin(false)
  }, [])

  const refreshUser = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) {
      // Build minimal session-shaped object for handleSessionChange
      const minimalSession = { user: currentUser, access_token: '' } as unknown as Session
      await handleSessionChange(minimalSession)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSessionChange is a plain (per-render) function; depending on it would change refreshUser's identity every render and re-memoize the auth context. The captured first-render closure only uses module singletons (supabase, ADMIN_EMAILS) and stable setState setters, so it is safe.
  }, [])

  const value = useMemo<AuthContextType>(() => ({
    session,
    user,
    isAdmin,
    loading,
    signOut,
    logout: signOut,
    login,
    register,
    refreshUser,
  }), [session, user, isAdmin, loading, signOut, login, register, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
