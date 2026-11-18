import { useEffect, useRef } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../hooks/useAuth'
import { useThemeColors } from '../providers/ThemeProvider'
import spacing from '../constants/spacing'
import { fontFamily, fontSize, lineHeight } from '../constants/typography'

/**
 * Landing screen for email confirmation links.
 *
 * Token exchange is owned solely by AuthProvider, which listens for the deep
 * link from the moment the app starts. This screen used to register a second
 * Linking listener and call `exchangeCodeForSession` itself; a PKCE code is
 * single-use, so the second exchange failed and the user saw "Link failed"
 * even though the first one had already created a valid session.
 *
 * All this screen does now is wait for the session that provider establishes.
 */
export default function AuthCallback() {
  const { session, loading } = useAuth()
  const navigated = useRef(false)
  const colors = useThemeColors()

  useEffect(() => {
    if (loading || navigated.current) return
    if (session) {
      navigated.current = true
      router.replace('/')
      return
    }
    // The exchange can still be in flight when the initial session check
    // finishes. Give it a short window before treating the link as unusable.
    const timer = setTimeout(() => {
      if (navigated.current) return
      navigated.current = true
      router.replace('/(auth)/login')
    }, 2500)
    return () => clearTimeout(timer)
  }, [session, loading])

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
      <Text
        style={{
          fontFamily: fontFamily.pjsRegular,
          fontSize: fontSize.caption,
          lineHeight: fontSize.caption * lineHeight.normal,
          textAlign: 'center',
          color: colors.text,
        }}
      >
        Opening your account…
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.pjsRegular,
          fontSize: fontSize.micro,
          lineHeight: fontSize.micro * lineHeight.normal,
          color: colors.textMuted,
          textAlign: 'center',
        }}
      >
        hibbullah://auth-callback — used for email confirmation on Android standalone.
      </Text>
    </View>
  )
}
