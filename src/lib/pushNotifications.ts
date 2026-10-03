import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { notificationsModule as Notifications } from "./notificationsModule";

/**
 * How a notification behaves while the app is in the foreground.
 *
 * The in-app list already updates itself over realtime, so a banner here is not how the
 * user learns something arrived — it is what makes an arrival visible when they are three
 * screens deep in the catalog instead of staring at the notifications tab. No sound: the
 * list is the primary surface, the banner is a nudge.
 *
 * Set at module load so it is in place before the first notification can arrive, which
 * for a cold-started or backgrounded app can be before any component has mounted. A
 * missing package has no foreground behaviour to configure, so it is skipped rather than
 * asked — nothing was ever going to reach this handler anyway.
 */
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Android will not put anything in the tray without a channel, and a channel needs a
 * name the user can recognise in system settings. Everything this app sends is one kind
 * of message, so there is one channel rather than a taxonomy nobody will ever open.
 */
async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "General",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Ask for permission and put this device's Expo token on file for `userId`.
 *
 * Android-first on purpose: iOS delivery additionally requires APNs credentials this
 * project has not set up, and registering a token that can never be honoured would put a
 * permanently failing recipient in the send path. When iOS is ready this is the single
 * gate to relax.
 *
 * Every failure path is a silent no-op rather than a throw: push is an enhancement layered
 * over an in-app list that already works, and a phone with notifications denied must still
 * be able to shop and order.
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS !== "android") return;
  // No package means no channel to ask about, no permission to request and no token to
  // file — the whole registration is a no-op, not a failure worth surfacing.
  if (!Notifications) return;
  // An emulator has no FCM registration behind it; the token it produces is dead on
  // arrival and would only accumulate failed tickets.
  if (!Device.isDevice) return;

  await ensureNotificationChannel();

  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === "granted" ? current.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const response = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  // Upsert, not insert: re-opening the app must not stack a second row for the same
  // device, or every notification would arrive twice.
  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      expo_push_token: response.data,
      platform: "android",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,expo_push_token" },
  );
  if (error) throw error;
}

/**
 * Drop every token this device registered for `userId`, called while the session that
 * owns those rows still exists (RLS only lets a user delete their own). Without it, the
 * next account signed in on the same phone would keep receiving the previous account's
 * notifications — the one routing mistake the whole design is meant to prevent.
 */
export async function removePushTokens(userId: string): Promise<void> {
  const { error } = await supabase.from("push_tokens").delete().eq("user_id", userId);
  if (error) throw error;
}
