import { Stack } from 'expo-router';

/**
 * Registers the route names that exist in this folder — nothing more.
 *
 * Headers are not configured here: every screen renders its own `ScreenHeader` through
 * `Screen` (see `docs/DESIGN-SYSTEM.md`), which is why the stack runs with
 * `headerShown: false`. To add a screen, drop a `.tsx` file in this folder and add a
 * matching `<Stack.Screen name="…" />` entry below.
 */
export default function CustomerAccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="profile" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="security" />
      <Stack.Screen name="help" />
      <Stack.Screen name="contact" />
      <Stack.Screen name="about" />
      <Stack.Screen name="terms" />
    </Stack>
  );
}
