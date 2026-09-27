# Open items

## Awaiting a device

Three of the nine bugs are engine-specific and cannot be confirmed by a typecheck, a lint,
a web export or a static guard. They are fixed in the source and unverified in the hand:

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

`npx expo export --platform android` builds, so the bundle is sound; what is untested is
Hermes' behaviour at runtime.

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
  customer side, the district text field, and the new error screen — have not been looked at
  by anyone.
