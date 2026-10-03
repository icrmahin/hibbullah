/**
 * The 64 districts of Bangladesh, grouped into their 8 divisions.
 *
 * A code constant, not a database table, and deliberately so. Districts are a fact about
 * the country: they change on the scale of years, and a list the admin can edit is a list
 * that can be wrong. Because the district decides the delivery fee, one typo here would
 * quietly undercharge or overcharge deliveries for as long as it existed, with nothing in
 * the app able to report it. Making it an admin-editable table would move that failure
 * from "caught by verify:sql-sync" to "found by a customer".
 *
 * Spellings are the government's post-2018 English forms — Bogura, Barishal, Jashore,
 * Chattogram, Cumilla — not the older Bogra/Barisal/Jessore/Chittagong/Comilla. Customers
 * and delivery riders use the current names, and mixing the two spellings is how the same
 * district ends up stored two different ways.
 *
 * `name` is the canonical value stored in `addresses.county` and compared by the delivery
 * fee rule, so it must be exactly one of these strings. `bn` is the Bangla name, shown as
 * a subtitle because this is how customers actually look for their own district.
 *
 * Verified mechanically by supabase/verify-sql-sync.mjs: exactly 64, no duplicate names,
 * every district carries a Bangla name, and the 8 division totals sum to 64. The count
 * matters — a district silently dropped from this list is a district no customer can
 * select, and they would not know why.
 */

export type DivisionName =
  | "Barishal"
  | "Chattogram"
  | "Dhaka"
  | "Khulna"
  | "Mymensingh"
  | "Rajshahi"
  | "Rangpur"
  | "Sylhet";

export type District = {
  /** Canonical English name. Stored in `addresses.county`; matched by the fee rule. */
  name: string;
  /** Bangla name, shown as a subtitle in the picker. */
  bn: string;
  division: DivisionName;
};

/** Division order as used by the government, which is also a sensible pick order. */
export const DIVISIONS: DivisionName[] = [
  "Dhaka",
  "Chattogram",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
];

export const DISTRICTS: District[] = [
  // ── Dhaka (13) ────────────────────────────────────────────────────────────────
  { name: "Dhaka", bn: "ঢাকা", division: "Dhaka" },
  { name: "Faridpur", bn: "ফরিদপুর", division: "Dhaka" },
  { name: "Gazipur", bn: "গাজীপুর", division: "Dhaka" },
  { name: "Gopalganj", bn: "গোপালগঞ্জ", division: "Dhaka" },
  { name: "Kishoreganj", bn: "কিশোরগঞ্জ", division: "Dhaka" },
  { name: "Madaripur", bn: "মাদারীপুর", division: "Dhaka" },
  { name: "Manikganj", bn: "মানিকগঞ্জ", division: "Dhaka" },
  { name: "Munshiganj", bn: "মুন্সিগঞ্জ", division: "Dhaka" },
  { name: "Narayanganj", bn: "নারায়ণগঞ্জ", division: "Dhaka" },
  { name: "Narsingdi", bn: "নরসিংদী", division: "Dhaka" },
  { name: "Rajbari", bn: "রাজবাড়ী", division: "Dhaka" },
  { name: "Shariatpur", bn: "শরীয়তপুর", division: "Dhaka" },
  { name: "Tangail", bn: "টাঙ্গাইল", division: "Dhaka" },

  // ── Chattogram (11) ───────────────────────────────────────────────────────────
  { name: "Chattogram", bn: "চট্টগ্রাম", division: "Chattogram" },
  { name: "Bandarban", bn: "বান্দরবান", division: "Chattogram" },
  { name: "Brahmanbaria", bn: "ব্রাহ্মণবাড়িয়া", division: "Chattogram" },
  { name: "Chandpur", bn: "চাঁদপুর", division: "Chattogram" },
  { name: "Cox's Bazar", bn: "কক্সবাজার", division: "Chattogram" },
  { name: "Cumilla", bn: "কুমিল্লা", division: "Chattogram" },
  { name: "Feni", bn: "ফেনী", division: "Chattogram" },
  { name: "Khagrachhari", bn: "খাগড়াছড়ি", division: "Chattogram" },
  { name: "Lakshmipur", bn: "লক্ষ্মীপুর", division: "Chattogram" },
  { name: "Noakhali", bn: "নোয়াখালী", division: "Chattogram" },
  { name: "Rangamati", bn: "রাঙ্গামাটি", division: "Chattogram" },

  // ── Rajshahi (8) ──────────────────────────────────────────────────────────────
  { name: "Rajshahi", bn: "রাজশাহী", division: "Rajshahi" },
  { name: "Bogura", bn: "বগুড়া", division: "Rajshahi" },
  { name: "Chapai Nawabganj", bn: "চাঁপাইনবাবগঞ্জ", division: "Rajshahi" },
  { name: "Joypurhat", bn: "জয়পুরহাট", division: "Rajshahi" },
  { name: "Naogaon", bn: "নওগাঁ", division: "Rajshahi" },
  { name: "Natore", bn: "নাটোর", division: "Rajshahi" },
  { name: "Pabna", bn: "পাবনা", division: "Rajshahi" },
  { name: "Sirajganj", bn: "সিরাজগঞ্জ", division: "Rajshahi" },

  // ── Khulna (10) ───────────────────────────────────────────────────────────────
  { name: "Khulna", bn: "খুলনা", division: "Khulna" },
  { name: "Bagerhat", bn: "বাগেরহাট", division: "Khulna" },
  { name: "Chuadanga", bn: "চুয়াডাঙ্গা", division: "Khulna" },
  { name: "Jashore", bn: "যশোর", division: "Khulna" },
  { name: "Jhenaidah", bn: "ঝিনাইদহ", division: "Khulna" },
  { name: "Kushtia", bn: "কুষ্টিয়া", division: "Khulna" },
  { name: "Magura", bn: "মাগুরা", division: "Khulna" },
  { name: "Meherpur", bn: "মেহেরপুর", division: "Khulna" },
  { name: "Narail", bn: "নড়াইল", division: "Khulna" },
  { name: "Satkhira", bn: "সাতক্ষীরা", division: "Khulna" },

  // ── Barishal (6) ──────────────────────────────────────────────────────────────
  { name: "Barishal", bn: "বরিশাল", division: "Barishal" },
  { name: "Barguna", bn: "বরগুনা", division: "Barishal" },
  { name: "Bhola", bn: "ভোলা", division: "Barishal" },
  { name: "Jhalokati", bn: "ঝালকাঠি", division: "Barishal" },
  { name: "Patuakhali", bn: "পটুয়াখালী", division: "Barishal" },
  { name: "Pirojpur", bn: "পিরোজপুর", division: "Barishal" },

  // ── Sylhet (4) ───────────────────────────────────────────────────────────────
  { name: "Sylhet", bn: "সিলেট", division: "Sylhet" },
  { name: "Habiganj", bn: "হবিগঞ্জ", division: "Sylhet" },
  { name: "Moulvibazar", bn: "মৌলভীবাজার", division: "Sylhet" },
  { name: "Sunamganj", bn: "সুনামগঞ্জ", division: "Sylhet" },

  // ── Rangpur (8) ──────────────────────────────────────────────────────────────
  { name: "Rangpur", bn: "রংপুর", division: "Rangpur" },
  { name: "Dinajpur", bn: "দিনাজপুর", division: "Rangpur" },
  { name: "Gaibandha", bn: "গাইবান্ধা", division: "Rangpur" },
  { name: "Kurigram", bn: "কুড়িগ্রাম", division: "Rangpur" },
  { name: "Lalmonirhat", bn: "লালমনিরহাট", division: "Rangpur" },
  { name: "Nilphamari", bn: "নীলফামারী", division: "Rangpur" },
  { name: "Panchagarh", bn: "পঞ্চগড়", division: "Rangpur" },
  { name: "Thakurgaon", bn: "ঠাকুরগাঁও", division: "Rangpur" },

  // ── Mymensingh (4) ───────────────────────────────────────────────────────────
  { name: "Mymensingh", bn: "ময়মনসিংহ", division: "Mymensingh" },
  { name: "Jamalpur", bn: "জামালপুর", division: "Mymensingh" },
  { name: "Netrokona", bn: "নেত্রকোণা", division: "Mymensingh" },
  { name: "Sherpur", bn: "শেরপুর", division: "Mymensingh" },
];

/**
 * The district that gets the reduced delivery fee.
 *
 * Dhaka District only, not the 13 districts of Dhaka Division. Gazipur and Narayanganj
 * are both large and close to the city, but they are genuinely further out, and pricing
 * them at the Dhaka rate would undercharge a large share of orders. Changing which
 * districts qualify is a one-line change here plus the matching SQL constant, and
 * verify:sql-sync fails if the two ever disagree.
 */
export const INSIDE_DHAKA_DISTRICT = "Dhaka";

/** Look up a district, or undefined if the name is not one we recognise. */
export function findDistrict(name?: string | null): District | undefined {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  return DISTRICTS.find((d) => d.name.toLowerCase() === needle);
}

/**
 * Fold a typed district to one comparable shape: lower case, apostrophes dropped, runs of
 * whitespace collapsed, and a trailing "district" discarded.
 *
 * "Cox's Bazar", "Coxs Bazar", "cox's  bazar" and "Cox's Bazar District" are one place
 * written four ways, and all four mean the same delivery.
 */
function districtKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*district\.?$/, "");
}

/**
 * Spellings accepted in addition to the canonical name, keyed by `districtKey`.
 *
 * The pre-2018 English names are still what most people write and what older saved
 * addresses hold, and "Cox's Bazar" is typed with and without the apostrophe. This is
 * deliberately an *input* convenience: `addresses.county` is only ever written with the
 * canonical name that `resolveDistrict` returns, which is what keeps the stored value
 * comparable by the server's delivery-fee rule.
 */
const DISTRICT_ALIASES: Record<string, string> = {
  bogra: "Bogura",
  barisal: "Barishal",
  jessore: "Jashore",
  chittagong: "Chattogram",
  chattagong: "Chattogram",
  comilla: "Cumilla",
  coxsbazar: "Cox's Bazar",
  coxbazar: "Cox's Bazar",
  // The apostrophe is dropped rather than replaced, so the spaced and unspaced forms are
  // different keys. Both are needed: "Cox's Bazar" and "Cox Bazar" are how it is written.
  "coxs bazar": "Cox's Bazar",
  "cox bazar": "Cox's Bazar",
  daka: "Dhaka",
};

/**
 * Resolve free text to a district, or undefined when it is not one we recognise.
 *
 * Accepts the canonical English name in any case, the Bangla name, the pre-2018 English
 * spelling, and a trailing "district". Used to validate the address form, which is a
 * plain text field rather than a 64-item picker.
 *
 * Note this is *not* wired into `isInsideDhaka`. That function is compared against the
 * SQL delivery-fee rule by verify:sql-sync, and loosening it here would let the app quote
 * a district rate for a spelling the server does not recognise — a checkout that
 * disagrees with the bill, which is exactly the split that check exists to prevent. The
 * form resolves to the canonical name *before* saving, so the stored value is always one
 * the server can match.
 */
export function resolveDistrict(input?: string | null): District | undefined {
  if (!input) return undefined;
  const key = districtKey(input);
  if (!key) return undefined;

  const aliased = DISTRICT_ALIASES[key];
  if (aliased) return findDistrict(aliased);

  return DISTRICTS.find(
    (d) => districtKey(d.name) === key || districtKey(d.bn) === key,
  );
}

/** True when `name` is the district that qualifies for the reduced fee. */
export function isInsideDhaka(name?: string | null): boolean {
  return !!name && name.trim().toLowerCase() === INSIDE_DHAKA_DISTRICT.toLowerCase();
}
