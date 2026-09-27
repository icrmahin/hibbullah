export { colors, brand, text, border, surface, status, util } from "./colors";
export { typography, fontFamily, fontSize, lineHeight, letterSpacing } from "./typography";
export { spacing } from "./spacing";
export { sizes, radius, borderWidth, layout, containerPadding, maxWidth, opacity, duration, spring } from "./sizes";
export { config } from "./config";
// The re-export of `./industrial` is gone. That file was a second, hand-written palette
// living beside the real one: light-mode only, with its own elevation scale and its own
// radius values, and nothing in the app imported any of it. Every `divider` in the codebase
// turned out to be a local `styles.divider` rather than the one this module re-exported —
// which is why deleting the file broke no screen and only broke this line.
//
// It was worth more than the dead exports it removed. A second palette that is almost but
// not quite the first is how "why is this card 8 and that one 16" gets answered with "they
// are in different files". There is one palette now.
