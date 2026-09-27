# Open items

## Awaiting a device

These cannot be confirmed by a typecheck, a lint, a web export or a static guard. They are
fixed in the source and unverified in the hand:

- **Profile picture upload (bug 3)** and **product image upload (bug 8)** — these failed
  twice, in two different ways, and both failures were invisible to every check that is not
  a device. First `Unsupported FormDataPart implementation`, from Expo's own FormData
  converter, because the classic React Native `{ uri, name, type }` part is not one of the
  three shapes it accepts. Then, after that was fixed, `Could not read selected image` on
  every upload, because the read was gated on `if (!res.ok) throw` — `ok` means
  `status >= 200 && status < 300`, an HTTP question asked of a `file://` URI, which does not
  answer with a 2xx. The bytes now come from `expo-file-system`'s `File.bytes()`, which is
  the shape that converter's own comment names.
- **Tapping Review on an order (bug 4)** — was killing the process, because the crash came
  from `Intl.DateTimeFormat.format()` on an invalid date and there was no ErrorBoundary
  anywhere in the app. The boundary now exists and the date parser rejects what it cannot
  read. Both halves need the device.
- **The delete-confirmation dialog on Android** — the buttons are now one view rather than
  a responder wrapping a painted child, which is what made the `android_ripple` draw a hard
  square on a pill. The fix is a platform-drawing change with no web equivalent, so the
  only way to see it is on the phone. `Modal.tsx` had the same split, plus a card that
  closed the dialog when its title or message was tapped.

## The flat redesign — what was changed and what to look at

Applied as a token change, so 162 radius call sites and 37 shadow consumers moved at once.
`radius` is now 2/6/8 with `pill` at 8; `useShadows()` returns `none` for all seven steps;
both palettes are unchanged in structure. The dark-mode primary button is now the accent
(`#8FB8A8` with a near-black label, 8.96:1) instead of a near-black fill, so the one thing
you press is the one saturated thing on the screen.

Three consequences worth a human eye, none of which a check can judge:

- **`radius.pill` → 8px touches 61 sites.** Every button, chip, badge, header and quantity
  stepper. This is the single most visible change and the least risky to revert.
- **Five labels were hardcoded `colors.white` on an accent fill.** They were correct against
  the old near-black dark-mode primary and became 2.19:1 against the new sage. All now use
  `colors.textInverse`. `verify-contrast.mjs` could not have caught this: it checks token
  *pairs* and had no idea a call site was pairing them wrongly. `verify:flat-ui` can.
- **Six decorative surfaces moved off the accent** — cart badge, avatar fallback, unread dot,
  order timeline dots, stat-card key — to neutral or status colours. The accent now fills
  only the primary button, a CTA, a FAB, the auth toggle and two "Add" buttons.

`verify:flat-ui` holds all of it in place (8 rules, 9 mutations, all caught).

## Standing items

These were outstanding before the nine bugs and are unrelated to them.

- **Rotate the `sbp_` access token.** It is a long-lived personal access token with been
  present in the working tree and shell history. Rotate it in the Supabase dashboard and
  move it out of `.env` into the CI secret store.
- **Rotate `CLOUDINARY_API_SECRET`.** Same exposure. The app only needs the upload preset
  for unsigned uploads, so the secret may not be needed by the app at all — confirm before
  rotating what depends on it.
- **The two extra admin Gmail addresses** on the allowlist. The project enforces exactly one
  owner (`verify:allowlist`, 13 checks). Decide which address is the owner and remove the
  other, so the invariant reflects a decision rather than a discovery.
- **No human has looked at any screen.** Every bug in this batch was found by running the
  installed APK, and the fixes were verified by a typecheck, a lint, a bundle, a static guard
  and a mutation test. None of that is a person seeing the UI. The changes that are purely
  visual — the search bar becoming a button, the removal of every stock indicator from the
  customer side, the district text field, the new error screen, and now the whole flat
  redesign — have not been looked at by anyone. The redesign was the one case where a browser
  screenshot at phone width was the obvious check and it could not be taken: no desktop
  browser is attached to this session, so `browser.tabs.open` fails and the dev server is
  running but unwatched. It is the largest purely visual change in the project and it has
  had no eyes on it at all.
