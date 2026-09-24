import { router } from 'expo-router'
import type { Href } from 'expo-router'

export function goBack(fallback: string = '/(auth)/welcome'): void {
  if (router.canGoBack()) {
    router.back()
  } else {
    router.replace(fallback as Href)
  }
}

export function goBackToTabs(): void {
  goBack('/(customer)/(tabs)')
}
