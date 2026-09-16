import { Stack } from 'expo-router';

/**
 * ============================================================================
 * HOW TO ADD A NEW ROUTE / SCREEN TO THIS ACCOUNT SECTION (Expo Router)
 * ============================================================================
 *
 * In Expo Router, routing is file-system based. Adding a new screen involves
 * the following steps:
 *
 * 1. CREATE SCREEN FILE:
 *    Add a new `.tsx` file inside `src/app/(customer)/account/`.
 *    For example:
 *      `src/app/(customer)/account/my-new-option.tsx`
 *    Inside the file, export a default React component:
 *      `export default function MyNewOptionScreen() { ... }`
 *
 * 2. REGISTER SCREEN HERE IN `_layout.tsx` (Optional but Recommended):
 *    Add a `<Stack.Screen />` entry inside the `<Stack>` below matching your file name (without `.tsx`):
 *      `<Stack.Screen name="my-new-option" options={{ ... }} />`
 *
 *    Useful screen options you can pass to `options={{ ... }}`:
 *      - `headerShown`: boolean - Toggle native navigation header (default is false here because screens use custom <Header />).
 *      - `title`: string - Title displayed in the native header when `headerShown: true`.
 *      - `presentation`: 'card' | 'modal' | 'transparentModal' - Screen transition style.
 *      - `animation`: 'default' | 'fade' | 'slide_from_right' | 'slide_from_bottom' | 'none'.
 *      - `headerBackTitle`: string - Custom text for iOS back button.
 *
 * 3. ADD TO ACCOUNT MENU (if it should appear in the Account tab):
 *    Open `src/app/(customer)/(tabs)/account.tsx` and add an entry to the `menuItems` array:
 *      `{ label: 'My New Option', route: '/(customer)/account/my-new-option' },`
 *
 * 4. NAVIGATE TO IT:
 *    - Programmatically:
 *        `import { router } from 'expo-router';`
 *        `router.push('/(customer)/account/my-new-option');`
 *    - Or declaratively:
 *        `import { Link } from 'expo-router';`
 *        `<Link href="/(customer)/account/my-new-option">My New Option</Link>`
 * ============================================================================
 */
export default function CustomerAccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Account Home */}
      <Stack.Screen name="overview" />

      {/* Account Management Screens */}
      <Stack.Screen name="profile" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

