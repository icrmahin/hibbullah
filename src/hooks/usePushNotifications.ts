import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { useAuth } from "./useAuth";
import { registerPushToken } from "../lib/pushNotifications";
import { useLastNotificationResponse } from "../lib/notificationsModule";

/** A notification's `referenceId` is an order id or nothing — never a path fragment. */
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The whole device-push surface, mounted once from the root layout.
 *
 * Two jobs, both keyed off who is signed in rather than off any per-notification role:
 *
 *   1. Register this device for the current user. The user id in `push_tokens` is the
 *      same `user_id` the notifications table routes on, so a customer's order updates
 *      and an admin's stock alerts reach the right phones without this code ever
 *      telling them apart — it only says "these are my devices".
 *   2. Turn a tap into navigation. The push carries the order it is about
 *      (`referenceId`), so the tap opens THAT order — admin route for an admin session,
 *      customer route otherwise. A push with no order behind it (a stock alert) opens
 *      the place in the app where its subject lives.
 *
 * Registration failures are logged, never thrown: a phone that denies notifications is
 * still a phone that can order, and the in-app list is the primary surface.
 */
export function usePushNotifications(): void {
  const { user, isAdmin } = useAuth();
  const userId = user?.id;
  const handledNotification = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    registerPushToken(userId).catch((err) => {
      console.warn("[push] could not register this device:", err instanceof Error ? err.message : err);
    });
  }, [userId]);

  // `useLastNotificationResponse` re-renders with the response that opened (or reopened)
  // the app and again if the user taps the same notification a second time. The ref makes
  // each response navigate at most once, so a response observed across several renders
  // cannot stack routes. Without the package there is no response to observe, and the
  // stub from `notificationsModule` reports exactly that.
  const lastResponse = useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse || !userId) return;
    const notificationId = lastResponse.notification.request.identifier;
    if (handledNotification.current === notificationId) return;
    handledNotification.current = notificationId;

    const data = lastResponse.notification.request.content.data as { referenceId?: unknown } | null | undefined;
    const referenceId =
      typeof data?.referenceId === "string" && ORDER_ID.test(data.referenceId) ? data.referenceId : null;

    if (referenceId) {
      router.push((isAdmin ? `/(admin)/orders/${referenceId}` : `/(customer)/order/${referenceId}`) as never);
    } else if (isAdmin) {
      // No order behind it — the admin-shaped notifications are stock alerts, and the
      // product list is where the thing they name can be acted on.
      router.push("/(admin)/products" as never);
    } else {
      router.push("/(customer)/account/notifications" as never);
    }
  }, [lastResponse, userId, isAdmin]);
}
