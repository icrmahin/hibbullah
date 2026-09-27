import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'
import { useThemeColors } from '../providers/ThemeProvider'
import spacing from '../constants/spacing'

export default function AuthCallback() {
  const [status, setStatus] = useState('Processing link...')
  const [error, setError] = useState<string | null>(null)
  // Was `'red'` and `'#666'`, two hex literals on a screen that is otherwise untokenised.
  // This is the screen a user sees when a confirmation email fails to open, often on a
  // cheap Android handset at night, and `#666` grey on an unthemed white page is the
  // one page in the app with no way to respect dark mode.
  const colors = useThemeColors()

  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url) {
        // Also try to check if we already have a session from AuthProvider
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace('/')
          return
        }
        setStatus('No link data. If you clicked an email link, ensure it opened via hibbullah:// on this device.')
        return
      }
      try {
        const parsed = Linking.parse(url)
        const q = parsed.queryParams as Record<string, string> | undefined
        const code = q?.code as string | undefined
        const token_hash = q?.token_hash as string | undefined
        const type = q?.type as string | undefined
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(url)
          if (error) throw error
          router.replace('/')
          return
        }
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as 'recovery' | 'signup' | 'email_change' | 'invite' | 'magiclink' | 'email' })
          if (error) throw error
          if (type === 'recovery') {
            router.replace('/(auth)/reset-password')
          } else {
            router.replace('/')
          }
          return
        }
        // Fallback hash parsing
        const hash = url.split('#')[1]
        if (hash) {
          const params = new URLSearchParams(hash)
          const access_token = params.get('access_token')
          const refresh_token = params.get('refresh_token')
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token })
            router.replace('/')
            return
          }
        }
        // If we have session already, go home
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace('/')
        } else {
          setStatus('Link processed. Opening app...')
          setTimeout(() => router.replace('/(auth)/login'), 1500)
        }
      } catch (e: any) {
        setError(e.message || 'Failed to handle link')
        setStatus('Link failed')
      }
    }

    Linking.getInitialURL().then(handle)
    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [])

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.xl,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={{ fontSize: 12, textAlign: 'center', color: colors.text }}>{status}</Text>
      {error ? (
        <Text style={{ fontSize: 12, color: colors.danger, textAlign: 'center' }}>{error}</Text>
      ) : null}
      <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>
        hibbullah://auth-callback — used for email confirmation and password recovery on
        Android standalone.
      </Text>
    </View>
  )
}
