import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const rawSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim()
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

function resolveSupabaseUrl(rawUrl: string): string {
  // Local `supabase start` default. Only used when env var is absent, not when it's wrong.
  if (!rawUrl) {
    return 'http://127.0.0.1:54321'
  }

  // #1 cause of "Invalid supabaseUrl": JWT / anon key pasted into the URL field.
  // e.g. EXPO_PUBLIC_SUPABASE_URL=eyJhbGciOi... instead of https://xyz.supabase.co
  if (rawUrl.startsWith('eyJ')) {
    throw new Error(
      'Invalid EXPO_PUBLIC_SUPABASE_URL: looks like a JWT, not a URL. ' +
        'You pasted the anon/publishable key into the URL field. ' +
        'Fix .env: EXPO_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co ' +
        'and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... (or eyJ... anon key). ' +
        'Then restart with: npx expo start --clear',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(
      `Invalid EXPO_PUBLIC_SUPABASE_URL: "${rawUrl}". Must be a valid HTTP or HTTPS URL, ` +
        'e.g. https://YOUR_REF.supabase.co for cloud or http://127.0.0.1:54321 for local. ' +
        'Then restart with: npx expo start --clear',
    )
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid EXPO_PUBLIC_SUPABASE_URL: "${rawUrl}". Must start with http:// or https://, ` +
        'e.g. https://YOUR_REF.supabase.co. Then restart with: npx expo start --clear',
    )
  }

  return rawUrl
}

const supabaseUrl = resolveSupabaseUrl(rawSupabaseUrl)

if (!supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: set it in .env to your Supabase ' +
      'publishable/anon key (sb_publishable_... or eyJ...). Then restart with: npx expo start --clear',
  )
}

// SSR/static-rendering (expo export, node) has no window — AsyncStorage will throw "window is not defined".
// On web, let Supabase use its default (localStorage) via undefined. On native, use AsyncStorage.
const isWeb = Platform.OS === 'web'
const isSSR = typeof window === 'undefined'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(isWeb || isSSR ? {} : { storage: AsyncStorage }),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})