import * as Haptics from "expo-haptics";

/**
 * Central haptics — every call site goes through here, never `expo-haptics`
 * directly.
 *
 * Each helper swallows its own failure and returns immediately: haptics are
 * feel, not function, so a device without a haptics motor (or a platform
 * without the module, like web) must never break or delay the action it
 * accompanies. Call sites deliberately do not await these.
 */
export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticError(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function hapticSelect(): void {
  void Haptics.selectionAsync().catch(() => {});
}

export function hapticConfirm(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
