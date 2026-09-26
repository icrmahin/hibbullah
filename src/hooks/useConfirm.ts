/**
 * Imperative confirmation: `if (!(await confirm({...}))) return`.
 *
 * Replaces `Alert.alert(..., [{ onPress }])`, whose `onPress` never fires on web because
 * react-native-web's Alert is `static alert() {}`. Two things are fixed by the shape of
 * this API rather than by convention:
 *
 *   1. The caller's work runs *after* an await, so a rejection propagates to the caller's
 *      own try/catch. Under `Alert.alert` the work sat in a callback invoked with no
 *      handler attached, so a failed delete was exactly as invisible as a successful
 *      one — `void clearAll()` rejects into nothing.
 *   2. The dialog cannot be double-fired, because it closes the instant it is confirmed.
 *      A second tap has nothing left to hit.
 *
 * The hook returns *props*, not an element, so it can stay a `.ts` file like every other
 * hook here; each screen spreads them onto `<ConfirmDialog>` itself. That is also what
 * keeps the dialog with the screen that opened it, rather than putting one instance in
 * the tree for every screen behind a global provider.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfirmOptions } from "../components/common/ConfirmDialog";

export type { ConfirmOptions };

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // Held in a ref, not state: the resolver is not render output, and putting it in state
  // would re-render purely to store a function.
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    setOptions(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second confirm while one is already open resolves the first as cancelled. Without
    // this the first promise would never settle, and any code awaiting it would hang for
    // the life of the screen.
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Unmounting with a dialog open would strand the promise forever, so the awaiting code
  // is released as cancelled. This is reachable in practice: opening a destructive
  // confirmation and then navigating away before answering.
  useEffect(() => {
    return () => {
      resolver.current?.(false);
      resolver.current = null;
    };
  }, []);

  const confirmDialogProps = {
    visible: options !== null,
    title: options?.title ?? "",
    message: options?.message,
    confirmLabel: options?.confirmLabel,
    cancelLabel: options?.cancelLabel,
    destructive: options?.destructive,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };

  return { confirm, confirmDialogProps };
}
