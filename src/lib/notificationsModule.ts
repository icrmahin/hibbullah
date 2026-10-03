import { isRunningInExpoGo } from "expo";

/**
 * `expo-notifications`, or `null` when it cannot be evaluated on this device.
 *
 * The package can throw *while it is being imported*, before any of this app's code runs,
 * and a throw that escapes a module evaluation is not contained to the module that threw:
 * Metro leaves the failed module's exports `undefined`, so every module above it fails to
 * evaluate too. Here that chain ends at `_layout.tsx` — `expo-notifications` is a
 * dependency of the root layout — and expo-router, reading a layout whose exports it
 * cannot find, reports `Cannot read property 'ErrorBoundary' of undefined`. The whole app
 * is replaced by that error because a push package was unhappy.
 *
 * It throws in two real situations:
 *
 *   1. **Expo Go.** Remote push was removed from Expo Go in SDK 53, and the package
 *      raises it by throwing from its own top level rather than by letting a call fail.
 *   2. **A JS bundle newer than the installed binary.** `PushTokenManager.native`
 *      resolves its native module at import time, so a bundle that has moved past the APK
 *      dies on `Cannot find native module 'ExpoPushTokenManager'`.
 *
 * Neither is a reason to lose the shop. The import is skipped where it is known not to
 * work and caught everywhere else, so push degrades to "not available in this session"
 * instead of taking the catalog, cart and checkout down with it — the same promise the
 * rest of this feature makes about a phone that denies notification permission.
 *
 * The `require` sits at module scope rather than inside an effect on purpose: Metro
 * reports an escaping module error through `ErrorUtils` instead of rethrowing it when it
 * happens outside a module evaluation, so a later lazy require would surface as a red box
 * rather than land in this catch. Loaded from here — during the root layout's own
 * evaluation — the throw arrives as an ordinary exception.
 */
type NotificationsModule = typeof import("expo-notifications");

function loadNotificationsModule(): NotificationsModule | null {
  // Asked before requiring, not caught after: in Expo Go the package throws from its own
  // top level, and a failed `require` is cached by Metro, so attempting it would poison
  // the module for the rest of the session even though nothing here is wrong.
  if (isRunningInExpoGo()) return null;

  try {
    // Metro rewrites this literal into a module id at build time, so the package ships in
    // the bundle either way — only the moment it is evaluated moves to here. A static
    // `import` cannot be put behind a `try`, which is the entire point of this file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred evaluation, see the header comment
    const loaded: NotificationsModule | undefined = require("expo-notifications");
    // A load that fails without throwing reports the error and hands back nothing; same
    // outcome, quieter road.
    return loaded ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolved once and never re-attempted. A module Metro has already marked as failed
 * rethrows its cached error on every later `require`, so a retry would only re-raise the
 * problem this exists to absorb.
 */
export const notificationsModule: NotificationsModule | null = loadNotificationsModule();

/**
 * `useLastNotificationResponse` when there is a package to call, and a stub that always
 * answers "nothing was tapped" when there is not.
 *
 * Chosen once at module scope so the *same* function runs on every render — swapping
 * which hook is called between renders is what React's rules-of-hooks forbid, and whether
 * push is available does not change while the app is running.
 */
export const useLastNotificationResponse: () => ReturnType<
  NotificationsModule["useLastNotificationResponse"]
> = notificationsModule?.useLastNotificationResponse ?? (() => null);
