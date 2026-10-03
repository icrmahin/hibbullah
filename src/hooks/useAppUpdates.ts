import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";

/**
 * Over-the-air update lifecycle.
 *
 * Native expo-updates already checks for an update on every cold start, in the
 * background and without blocking launch, and a downloaded update is applied
 * automatically at the next app start. This hook adds exactly two things the
 * native side cannot do on its own:
 *
 * 1. A foreground re-check, but only when the app comes back from the
 *    background after a long session (>= 6h since the last attempt). Cold
 *    starts are covered natively, so this hook must NOT check on mount —
 *    that would fire a duplicate network request on every launch.
 * 2. A visible state (`updateReady`) so the UI can tell the user an update
 *    is staged and will install the next time they open the app.
 *
 * What this hook deliberately never does:
 * - never calls `reloadAsync()` — the current session is never interrupted;
 * - never surfaces errors — offline or transient failures fail silently and
 *   leave the running bundle untouched; the next cold start retries.
 */
const STARTUP_DELAY_MS = 3000;
const STARTUP_GRACE_MS = 15000;
const CHECK_TIMEOUT_MS = 10000;
const DOWNLOAD_TIMEOUT_MS = 30000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("update check timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function useAppUpdates() {
  const startedAt = useRef(0);
  const lastCheckAt = useRef(0);
  const inFlight = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const { isUpdatePending } = Updates.useUpdates();

  const runCheck = useCallback(async () => {
    // Dev client, Expo Go without config, or updates disabled: nothing to do.
    if (!Updates.isEnabled) return;
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
      const available = result.isAvailable || result.isRollBackToEmbedded;
      if (available) {
        await withTimeout(Updates.fetchUpdateAsync(), DOWNLOAD_TIMEOUT_MS);
      }
    } catch {
      // Offline or transient failure: stay on the current bundle. The next
      // cold start performs the native launch check and retries for free.
    } finally {
      lastCheckAt.current = Date.now();
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
    const timer = setTimeout(() => {
      void runCheck();
    }, STARTUP_DELAY_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      // Skip the active event that fires during startup itself; the delayed
      // check above already covers the cold start.
      if (Date.now() - startedAt.current < STARTUP_GRACE_MS) return;
      if (Date.now() - lastCheckAt.current < RECHECK_INTERVAL_MS) return;
      void runCheck();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [runCheck]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { updateReady: isUpdatePending && !dismissed, dismiss };
}

export default useAppUpdates;
