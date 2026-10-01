import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "./useResponsive";
import { spacing } from "../constants/spacing";

/**
 * Bottom padding for scrollable screen content, in one place.
 *
 * The bottom navigation (customer and admin alike) is an *in-flow* sibling of the stack, not
 * an overlay: it sits below the screen and already pads itself for the device inset. Screens
 * that also added `max(insets.bottom, …) + 24` were counting that inset twice — on a phone
 * with a 34pt home indicator the gap between the last row and the nav bar was ~100pt of
 * nothing, which is the "excessive empty space" a compact layout is supposed to avoid.
 *
 * So: on mobile, a fixed gap is all a screen needs because the bar below it absorbs the
 * inset. On tablet/desktop there is no bottom bar, so the screen clears the inset itself.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  const { isMobile } = useResponsive();

  return isMobile ? spacing.xxl : Math.max(insets.bottom, spacing.xxl);
}

export default useBottomInset;
