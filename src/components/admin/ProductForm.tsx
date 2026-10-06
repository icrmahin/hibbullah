import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { useBottomInset } from "../../hooks/useBottomInset";
import { useThemeColors } from "../../providers/ThemeProvider";
import type { ProductUpdate } from "../../services/products";
import type { Category } from "../../types/category";
import type { Manufacturer } from "../../types/manufacturer";
import type { Product } from "../../types/product";
import { formatCurrency, getSalePrice } from "../../utils/currency";
import { randomUuid } from "../../utils/uuid";
import { isEmpty, parseDiscountPercent } from "../../utils/validation";
import Button from "../common/Button";
import Chip from "../common/Chip";
import ImageUpload from "../common/ImageUpload";
import Input from "../common/Input";
import type { SelectOption } from "../common/SearchableSelect";
import SearchableSelect from "../common/SearchableSelect";

/**
 * The payload the form produces. It is a create payload, so the required fields
 * are present, and it doubles as a partial update because the same type is what
 * `updateProduct` takes.
 *
 * `genericName` is deliberately absent: the "same medicine, any brand" box is gone from the
 * form, so a new medicine stores an empty generic and an edited one keeps whatever it
 * already had (`undefined` in an update means "leave it alone").
 */
export type ProductFormInput = ProductUpdate & {
  id?: string;
  name: string;
  brand: string;
  manufacturerId: string | null;
  categoryId: string | null;
  description: string;
  price: number;
  stock: number;
  unit: string;
  isActive: boolean;
};

type ProductFormProps = {
  product?: Product;
  categories: Category[];
  manufacturers: Manufacturer[];
  /** Called with the search term so the screen can query the database. */
  onSearchCategories?: (search: string) => void;
  onSearchManufacturers?: (search: string) => void;
  categoriesLoading?: boolean;
  manufacturersLoading?: boolean;
  /** Creates the row and returns it, so the new option appears immediately. */
  onCreateCategory: (name: string) => Promise<Category>;
  onCreateManufacturer: (name: string) => Promise<Manufacturer>;
  /**
   * Uploads the picked file to Cloudinary and returns the stored URL.
   *
   * The form passes its product id because the image has to be uploaded to
   * `products/<id>` before the product row exists.
   */
  onUploadImage: (
    localUri: string,
    slot: "primary" | "secondary",
    productId: string,
  ) => Promise<string>;
  submitLabel: string;
  onSubmit: (input: ProductFormInput) => Promise<void>;
};

/**
 * The three ways a medicine is sold, as a selector rather than a free-text box.
 *
 * The value written back is lowercase because `products.unit` defaults to `'pack'` and
 * `create_product` coalesces to that same string, so a medicine saved through this control
 * is stored exactly like one saved before it existed. The label is capitalised because it
 * is a word a person reads, not a value a column holds.
 */
const SOLD_AS = [
  { label: "Pack", value: "pack" },
  { label: "Bottle", value: "bottle" },
  { label: "Box", value: "box" },
] as const;

/**
 * Fields whose blank value is meaningful — `costPrice`, `stock` and `expiryDate`.
 *
 * On edit, an untouched blank field must leave the stored value alone. The
 * previous form always sent every field, so clearing the cost-price box silently
 * set `cost_price` to null and clearing the discount box reset the discount to 0
 * — the admin retyped a price, hit save, and lost data they never touched.
 * Tracking which fields the admin actually edited is what makes "leave blank to
 * keep" true, and it is also what lets the same form be used for a partial save.
 *
 * `expiryDate` is on the list because `products` has no expiry column at all: the date
 * lives on `inventory_items`, so the box starts empty on every edit. Sending it unasked
 * would have written a null over a real batch expiry. `unit` is not on it — the box holds
 * exactly what is stored, so writing it back is a no-op rather than a reset.
 */
type OptionalField = "costPrice" | "stock" | "expiryDate";

export default function ProductForm({
  product,
  categories,
  manufacturers,
  onSearchCategories,
  onSearchManufacturers,
  categoriesLoading,
  manufacturersLoading,
  onCreateCategory,
  onCreateManufacturer,
  onUploadImage,
  submitLabel,
  onSubmit,
}: ProductFormProps) {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const isEditing = Boolean(product);

  // Generated once per form instance. Images upload to `products/<id>`, so the
  // id has to exist before the product row does.
  const [productId] = useState(() => product?.id ?? randomUuid());

  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [manufacturerId, setManufacturerId] = useState(
    product?.manufacturerId ?? "",
  );
  const [unit, setUnit] = useState(product?.unit ?? "pack");
  const [description, setDescription] = useState(product?.description ?? "");
  /**
   * The customer price, *before* any discount — the box the discount is a percentage of.
   *
   * When a discount is stored, `original_price` holds the number that was typed here and
   * `price` holds what was left after the percentage. Reading `original_price` back into
   * this box is what makes a second save start from the same figure, so the discount is
   * recomputed rather than taken off a price that already had it taken off.
   */
  const [price, setPrice] = useState(() => {
    if (!product) return "";
    const discounted =
      (product.discountPercent ?? 0) > 0 && product.originalPrice != null;
    return String(discounted ? product.originalPrice : product.price);
  });
  const [costPrice, setCostPrice] = useState(
    product?.costPrice != null ? String(product.costPrice) : "",
  );
  const [discountPercent, setDiscountPercent] = useState(
    product && (product.discountPercent ?? 0) > 0
      ? String(product.discountPercent)
      : "",
  );
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [primaryImage, setPrimaryImage] = useState<string | null>(
    product?.primaryImage ?? product?.image ?? null,
  );
  const [secondaryImage, setSecondaryImage] = useState<string | null>(
    product?.secondaryImage ?? null,
  );
  const [expiryDate, setExpiryDate] = useState(product?.expiryDate ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);

  // Only options created *inline* are held in state. The fetched lists are used
  // straight from the props.
  //
  // This was `useState<Category[]>(categories)`, which reads its argument on the first
  // render only. `categories` arrives from an async hook, so on that first render it is
  // `[]` — and the copy was then never refreshed, because this file had no `useEffect` to
  // refresh it. The picker listed only rows created from inside this form, which is why
  // no previously saved category ever appeared. Keeping the fetched list as a prop and
  // state for just the additions removes the synchronisation entirely, so it cannot go
  // stale again.
  const [addedCats, setAddedCats] = useState<Category[]>([]);
  const [addedMans, setAddedMans] = useState<Manufacturer[]>([]);

  const [touched, setTouched] = useState<Partial<Record<OptionalField, boolean>>>(
    {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const markTouched = (field: OptionalField) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  // Images upload the moment they are picked, so the URL — not the local file —
  // is what the form holds and what gets saved.
  const [uploadingSlot, setUploadingSlot] = useState<
    "primary" | "secondary" | null
  >(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [manufacturerAddOpen, setManufacturerAddOpen] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState("");
  const [newManufacturerError, setNewManufacturerError] = useState<string | null>(
    null,
  );
  const [addingManufacturer, setAddingManufacturer] = useState(false);

  // The fetched list, plus anything created inline this session. A newly created option
  // must stay selectable even if the current search term would filter it out of the
  // fetched list, and a row present in both is listed once.
  const categoryOptions = useMemo<SelectOption[]>(() => {
    const byId = new Map<string, Category>();
    for (const c of categories) byId.set(c.id, c);
    for (const c of addedCats) if (!byId.has(c.id)) byId.set(c.id, c);
    return [...byId.values()].map((c) => ({ label: c.name, value: c.id }));
  }, [categories, addedCats]);
  const manufacturerOptions = useMemo<SelectOption[]>(() => {
    const byId = new Map<string, Manufacturer>();
    for (const m of manufacturers) byId.set(m.id, m);
    for (const m of addedMans) if (!byId.has(m.id)) byId.set(m.id, m);
    return [...byId.values()].map((m) => ({ label: m.name, value: m.id }));
  }, [manufacturers, addedMans]);

  /**
   * What the discount box currently says, parsed once for validation, for the price the
   * customer will pay, and for the preview line under the field. A box that does not parse
   * reads as "no discount" for those two and is caught by `validate` before the save runs,
   * so an unparsable value can never reach the database.
   */
  const parsedDiscount = parseDiscountPercent(discountPercent);
  const discountValue = parsedDiscount.ok ? parsedDiscount.percent : 0;
  const customerPrice = Number(price);
  const discountedPrice =
    discountValue > 0 && Number.isFinite(customerPrice) && customerPrice > 0
      ? getSalePrice(customerPrice, discountValue)
      : null;

  const validate = useMemo(() => {
    const next: Record<string, string> = {};

    if (isEmpty(name)) next.name = "Write the medicine name.";
    // Brand, category, and company are optional on add: brand falls back to an
    // empty string (the generic_name precedent), category/company to null.

    const priceNum = Number(price);
    if (isEmpty(price)) next.price = "Write the selling price.";
    else if (Number.isNaN(priceNum) || priceNum <= 0)
      next.price = "Write a valid price.";

    const discount = parseDiscountPercent(discountPercent);
    if (!discount.ok) next.discountPercent = discount.message;

    const costNum = costPrice ? Number(costPrice) : NaN;
    if (costPrice) {
      if (Number.isNaN(costNum) || costNum < 0)
        next.costPrice = "Enter a valid cost price.";
      // Against the customer price, not the discounted one: a discount is a choice, and a
      // cost above the shelf price is a loss either way.
      else if (!isEmpty(price) && !Number.isNaN(priceNum) && costNum > priceNum)
        next.costPrice =
          "That is more than the customer price, so check the two numbers.";
    }

    // Stock is required when creating, optional when editing (leave it alone
    // unless the admin actually changed it).
    if (isEditing && !touched.stock) {
      // no validation
    } else if (isEmpty(stock)) {
      next.stock = "Write how many you have.";
    } else {
      const stockNum = Number(stock);
      if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum))
        next.stock = "Write a whole number.";
    }

    // Optional: only checked when something was typed, so an empty box never blocks a save
    // and never reaches the RPC. PostgREST casts p_expiry_date to date before
    // create_product runs, so anything that is not YYYY-MM-DD is a 400 with no row written.
    // Date.parse accepts slashes and other spellings Postgres rejects, hence the strict
    // check.
    if (expiryDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim()))
        next.expiryDate =
          "Write it as 2027-05-12 — four digits for the year, then two, then two.";
      else if (Number.isNaN(Date.parse(expiryDate.trim())))
        next.expiryDate = "That is not a real date. Write it as 2027-05-12.";
    }

    // The primary photo is the one thing this form will not save without. The second one
    // stays optional and is never asked for.
    if (!primaryImage)
      next.primaryImage = "Add a photo of the medicine — it is how customers find it.";

    return next;
  }, [
    name,
    brand,
    categoryId,
    manufacturerId,
    price,
    costPrice,
    discountPercent,
    stock,
    expiryDate,
    primaryImage,
    isEditing,
    touched.stock,
  ]);

  const handleSubmit = async () => {
    const validation = validate;
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      // The save button sits at the bottom, far from the fields: say plainly
      // what is missing so the owner does not hunt for it.
      setSubmitError("Please fix the fields marked above.");
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      // An untouched stock box means "keep the stored total", which the partial
      // update expresses by keeping the key out of the payload entirely.
      const untouchedStock =
        isEditing && !touched.stock ? product?.stock : undefined;

      // The whole pricing story comes from two boxes. The percentage is applied to the
      // customer price the admin typed, never to the number it produced, so opening a
      // discounted medicine and saving it untouched writes the same three columns again
      // rather than compounding them.
      const percent = discountValue;

      const payload: ProductFormInput = {
        name: name.trim(),
        brand: brand.trim(),
        manufacturerId: manufacturerId || null,
        categoryId: categoryId || null,
        description: description.trim(),
        price:
          percent > 0 ? getSalePrice(customerPrice, percent) : customerPrice,
        stock: untouchedStock ?? Number(stock),
        unit: unit.trim() || "pack",
        primaryImage,
        secondaryImage,
        isActive,
        isFeatured,
        // All three travel together so the pairing the database enforces holds whatever
        // the admin changed: a discount carries the price it came off, and clearing it
        // clears both rather than leaving a struck-through price with nothing struck.
        originalPrice: percent > 0 ? customerPrice : null,
        discountPercent: percent > 0 ? percent : null,
      };

      if (!isEditing) payload.id = productId;

      // Same rule for the other optional fields: absent when the admin never
      // touched them, `null` when they were cleared on purpose.
      if (!isEditing || touched.costPrice)
        payload.costPrice = costPrice ? Number(costPrice) : null;
      if (!isEditing || touched.expiryDate)
        payload.expiryDate = expiryDate.trim() || null;

      await onSubmit(payload);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Could not save the product. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    const value = newCategoryName.trim();
    if (!value) {
      setNewCategoryError("Category name is required.");
      return;
    }
    setAddingCategory(true);
    setNewCategoryError(null);
    try {
      const created = await onCreateCategory(value);
      setAddedCats((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created],
      );
      setCategoryId(created.id);
      setNewCategoryName("");
      setCategoryAddOpen(false);
    } catch (err) {
      setNewCategoryError(
        err instanceof Error ? err.message : "Could not add the category.",
      );
    } finally {
      setAddingCategory(false);
    }
  };

  const handleAddManufacturer = async () => {
    const value = newManufacturerName.trim();
    if (!value) {
      setNewManufacturerError("Manufacturer name is required.");
      return;
    }
    setAddingManufacturer(true);
    setNewManufacturerError(null);
    try {
      const created = await onCreateManufacturer(value);
      setAddedMans((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created],
      );
      setManufacturerId(created.id);
      setNewManufacturerName("");
      setManufacturerAddOpen(false);
    } catch (err) {
      setNewManufacturerError(
        err instanceof Error ? err.message : "Could not add the manufacturer.",
      );
    } finally {
      setAddingManufacturer(false);
    }
  };

  /**
   * Upload on pick, not on save.
   *
   * Text and numbers go to the database; the binary goes to Cloudinary and the URL it
   * returns is what gets saved. Uploading immediately means the admin sees the result
   * straight away instead of after a second round trip on submit.
   *
   * Nothing is destroyed here. An unsigned upload cannot replace an existing asset, so
   * the replaced picture is reclaimed after the product is saved (see
   * `reclaimSupersededProductImages`) — never at pick time, or cancelling the edit
   * would leave the saved row pointing at a deleted file.
   */
  const handlePickImage = async (
    localUri: string,
    slot: "primary" | "secondary",
  ) => {
    setUploadingSlot(slot);
    setImageError(null);
    try {
      const url = await onUploadImage(localUri, slot, productId);
      if (slot === "primary") setPrimaryImage(url);
      else setSecondaryImage(url);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : "Could not upload the image.",
      );
    } finally {
      setUploadingSlot(null);
    }
  };

  /**
   * Clearing an image only clears the field. The superseded Cloudinary asset is
   * reclaimed once the product is saved, not on an uncommitted edit, so removing a
   * photo by accident and coming back does not cost a re-upload.
   */
  const handleRemoveImage = (slot: "primary" | "secondary") => {
    if (slot === "primary") setPrimaryImage(null);
    else setSecondaryImage(null);
  };

  const SECTION = (label: string) => (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
      {label}
    </Text>
  );

  const addFooter = (
    isOpen: boolean,
    onToggle: () => void,
    toggleLabel: string,
    hideLabel: string,
    inputLabel: string,
    placeholder: string,
    value: string,
    onChange: (v: string) => void,
    fieldError: string | null,
    onSubmitAdd: () => void,
    busy: boolean,
  ) => (
    <View style={styles.group}>
      <Pressable
        onPress={onToggle}
        style={[
          styles.addToggle,
          {
            borderColor: colors.borderLight,
            backgroundColor: colors.backgroundAlt,
          },
        ]}
        accessibilityRole="button"
      >
        <Text style={[styles.addToggleText, { color: colors.accent }]}>
          {isOpen ? `▼ ${hideLabel}` : `＋ ${toggleLabel}`}
        </Text>
      </Pressable>
      {isOpen ? (
        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <Input
              label={inputLabel}
              value={value}
              onChangeText={onChange}
              placeholder={placeholder}
              error={fieldError ?? undefined}
              autoCapitalize="words"
            />
          </View>
          <Pressable
            onPress={onSubmitAdd}
            disabled={busy}
            style={[
              styles.inlineButton,
              { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text
              style={[styles.inlineButtonText, { color: colors.textInverse }]}
            >
              {busy ? "Adding…" : "Add"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const busy = saving || uploadingSlot !== null;

  /**
   * What this product earns, said in the owner's terms rather than as a percentage.
   *
   * Hoisted out of the JSX because two things need the same numbers: the sentence, and
   * whether to render it in the danger colour. Doing it inside an inline IIFE is what made
   * the first attempt reach for `c` and `p` in the `style` prop, where they are not in
   * scope — the two halves of one fact drifting into two places.
   *
   * A cost at or above the price is not a small earning, it is a loss on every pack, and
   * it is the most expensive mistake this form allows. It is said in words and shown in
   * the danger colour, rather than rendered as a negative percentage under the word
   * "margin" as it was before.
   */
  const costNum = costPrice ? Number(costPrice) : NaN;
  // What the customer actually hands over, which is what an earning is earned on: a
  // discounted medicine does not earn the figure before the discount.
  const effectivePrice = discountedPrice ?? customerPrice;
  const hasPrice = Number.isFinite(effectivePrice) && effectivePrice >= 0;
  const hasCost = Number.isFinite(costNum);
  const sellingAtALoss = hasPrice && hasCost && costNum > effectivePrice;
  const earningHint = !hasPrice || !hasCost
    ? "Add what you pay for it and this product starts counting towards your earnings."
    : sellingAtALoss
      ? "You are paying more for this than you are selling it for."
      : effectivePrice === 0
        ? "This one is free, so it earns nothing on each pack."
        : `You make ৳ ${(effectivePrice - costNum).toFixed(2)} on each pack · ${(((effectivePrice - costNum) / effectivePrice) * 100).toFixed(0)}% of the selling price`;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: bottomInset },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* One white card, no border and no shadow: the page colour does the framing. */}
        <View style={[styles.form, { backgroundColor: colors.backgroundAlt }]}>
          {SECTION("1 · The medicine")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Medicine name"
                hint="With strength, e.g. Napa Extra 500 mg"
                value={name}
                onChangeText={setName}
                error={errors.name}
                placeholder="e.g. Napa Extra 500 mg"
              />
            </View>
            <View style={styles.field}>
              <SearchableSelect
                label="Category"
                value={categoryId || undefined}
                options={categoryOptions}
                onSelect={setCategoryId}
                onSearch={onSearchCategories}
                loading={categoriesLoading}
                searchPlaceholder="Search categories"
                emptyMessage="No categories match. Add one below."
                placeholder="e.g. Pain relief"
                error={errors.categoryId}
                footer={addFooter(
                  categoryAddOpen,
                  () => setCategoryAddOpen((v) => !v),
                  "New category",
                  "Hide",
                  "New category name",
                  "e.g. Pain relief",
                  newCategoryName,
                  setNewCategoryName,
                  newCategoryError,
                  handleAddCategory,
                  addingCategory,
                )}
              />
            </View>
          </View>

          {/*
            Two boxes under one title. The database keeps them apart — `brand` is text and
            `manufacturer_id` is a key that has to exist — so they are gathered here rather
            than collapsed into a single string, which would either have had to be parsed
            back apart or have dropped the company entirely.
          */}
          <View style={styles.group}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              Brand Name / Manufacturer
            </Text>
            <View style={styles.row}>
              <View style={styles.field}>
                <Input
                  value={brand}
                  onChangeText={setBrand}
                  error={errors.brand}
                  placeholder="Brand, e.g. Napa"
                  accessibilityLabel="Brand name"
                />
              </View>
              <View style={styles.field}>
                <SearchableSelect
                  value={manufacturerId || undefined}
                  options={manufacturerOptions}
                  onSelect={setManufacturerId}
                  onSearch={onSearchManufacturers}
                  loading={manufacturersLoading}
                  searchPlaceholder="Search companies"
                  emptyMessage="No companies match. Add one below."
                  placeholder="Company, e.g. Square"
                  error={errors.manufacturerId}
                  footer={addFooter(
                    manufacturerAddOpen,
                    () => setManufacturerAddOpen((v) => !v),
                    "New company",
                    "Hide",
                    "New company name",
                    "e.g. Square",
                    newManufacturerName,
                    setNewManufacturerName,
                    newManufacturerError,
                    handleAddManufacturer,
                    addingManufacturer,
                  )}
                />
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>
                Sold as
              </Text>
              <View style={styles.chipRow}>
                {SOLD_AS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={unit === option.value}
                    onPress={() => setUnit(option.value)}
                  />
                ))}
              </View>
            </View>
          </View>

          {SECTION("2 · Price & stock")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Customer price"
                hint="What the customer pays, before any discount"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                error={errors.price}
                placeholder="e.g. 120"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Discount"
                hint="10 or 10% — both mean 10% off"
                value={discountPercent}
                onChangeText={setDiscountPercent}
                error={errors.discountPercent}
                placeholder="Optional"
              />
            </View>
          </View>
          {discountedPrice != null ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {`Customer pays ${formatCurrency(discountedPrice)} after ${discountValue}% off`}
            </Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Admin price"
                hint="What you pay the supplier"
                value={costPrice}
                onChangeText={(v) => {
                  setCostPrice(v);
                  markTouched("costPrice");
                }}
                keyboardType="decimal-pad"
                error={errors.costPrice}
                placeholder="e.g. 100"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Total Stock"
                hint={
                  isEditing
                    ? "Leave empty to keep what you have."
                    : "Count the packs on your shelf"
                }
                value={stock}
                onChangeText={(v) => {
                  setStock(v);
                  markTouched("stock");
                }}
                keyboardType="numeric"
                error={errors.stock}
                placeholder="e.g. 50"
              />
            </View>
          </View>
          {costPrice || price ? (
            <Text
              style={[
                styles.hint,
                { color: sellingAtALoss ? colors.danger : colors.textMuted },
              ]}
            >
              {earningHint}
            </Text>
          ) : null}

          {/* Optional, and said so: an empty box saves, a filled one is checked. */}
          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Expiry date"
                hint="Optional — the app warns you before it expires"
                value={expiryDate}
                onChangeText={(v) => {
                  setExpiryDate(v);
                  markTouched("expiryDate");
                }}
                placeholder="2027-05-12"
                error={errors.expiryDate}
                autoCapitalize="none"
              />
            </View>
          </View>

          {SECTION("3 · Photo")}

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Uploads straight away, so you see it at once. The old photo is
            replaced only when you press Save.
          </Text>

          <View style={styles.imageRow}>
            <View style={styles.imageSlot}>
              <ImageUpload
                label="Medicine photo"
                uri={primaryImage}
                uploading={uploadingSlot === "primary"}
                onPick={(uri) => void handlePickImage(uri, "primary")}
                onRemove={() => handleRemoveImage("primary")}
              />
              {errors.primaryImage ? (
                <Text style={[styles.error, { color: colors.danger }]}>
                  {errors.primaryImage}
                </Text>
              ) : null}
            </View>
            <View style={styles.imageSlot}>
              <ImageUpload
                label="Box photo"
                variant="compact"
                optional
                uri={secondaryImage}
                uploading={uploadingSlot === "secondary"}
                onPick={(uri) => void handlePickImage(uri, "secondary")}
                onRemove={() => handleRemoveImage("secondary")}
              />
            </View>
          </View>
          {imageError && !uploadingSlot ? (
            <Text style={[styles.error, { color: colors.danger }]}>
              {imageError}
            </Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="About this medicine (optional)"
                hint="What it treats and how to take it."
                value={description}
                onChangeText={setDescription}
                multiline
                error={errors.description}
                placeholder="What it is used for, and how it is taken"
              />
            </View>
          </View>

          <View
            style={[styles.switches, { borderTopColor: colors.borderSoft }]}
          >
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  Show on home page
                </Text>
                <Text style={[styles.switchHint, { color: colors.textMuted }]}>
                  Shows it on the home page
                </Text>
              </View>
              <Switch
                value={isFeatured}
                onValueChange={setIsFeatured}
                trackColor={{
                  false: colors.border,
                  true: colors.primarySoft,
                }}
                thumbColor={isFeatured ? colors.accent : colors.textMuted}
                accessibilityLabel="Show on home page"
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  Selling now
                </Text>
                <Text style={[styles.switchHint, { color: colors.textMuted }]}>
                  Off hides it from the shop without deleting it
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={isActive ? colors.accent : colors.textMuted}
                accessibilityLabel="Selling now"
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            borderTopColor: colors.borderSoft,
            backgroundColor: colors.background,
          },
        ]}
      >
        {submitError ? (
          <Text style={[styles.submitError, { color: colors.danger }]}>
            {submitError}
          </Text>
        ) : null}
        <Button
          title={saving ? "Saving..." : submitLabel}
          onPress={handleSubmit}
          loading={saving}
          disabled={busy}
          fullWidth
        />
        {isEditing ? (
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Anything you do not change is left as it was.
          </Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    padding: spacing.lg,
    alignSelf: "center",
    width: "100%",
    maxWidth: 720,
  },
  form: {
    gap: spacing.md,
    borderRadius: sizes.cardRadius,
    padding: spacing.lg,
  },
  // Section eyebrow: one size, one weight, no shouting — the label names the group,
  // the inputs below it carry the rest.
  sectionLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    marginTop: spacing.sm,
  },
  // A label the form draws itself, matching `Input`'s exactly, for the two places a title
  // belongs to more than one control: the combined brand/company pair and the chip row.
  fieldLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.bodySmall,
    lineHeight: fontSize.bodySmall * lineHeight.normal,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  field: {
    flexGrow: 1,
    flexBasis: 240,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  group: { gap: spacing.sm },
  addToggle: {
    borderWidth: 1,
    borderRadius: sizes.cardRadius,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignSelf: "flex-start",
  },
  addToggleText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  inlineField: { flex: 1 },
  inlineButton: {
    borderRadius: sizes.cardRadius,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  inlineButtonText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  imageRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  imageSlot: { flex: 1 },
  switches: {
    gap: spacing.sm,
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    gap: spacing.md,
  },
  switchText: { flex: 1, gap: 2 },
  switchLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  switchHint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  hint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.xs,
  },
  // The sticky action bar: one hairline against the card above it, nothing else.
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  submitError: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  note: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
