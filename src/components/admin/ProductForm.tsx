import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import type { Category } from "../../types/category";
import type { Manufacturer } from "../../types/manufacturer";
import type { Product } from "../../types/product";
import type { ProductUpdate } from "../../services/products";
import { isEmpty } from "../../utils/validation";
import { randomUuid } from "../../utils/uuid";
import Button from "../common/Button";
import ImageUpload from "../common/ImageUpload";
import Input from "../common/Input";
import SearchableSelect from "../common/SearchableSelect";
import type { SelectOption } from "../common/SearchableSelect";

/**
 * The payload the form produces. It is a create payload, so the required fields
 * are present, and it doubles as a partial update because the same type is what
 * `updateProduct` takes.
 */
export type ProductFormInput = ProductUpdate & {
  id?: string;
  name: string;
  brand: string;
  genericName: string;
  manufacturerId: string;
  categoryId: string;
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
 * Fields whose blank value is meaningful.
 *
 * On edit, an untouched blank field must leave the stored value alone. The
 * previous form always sent every field, so clearing the cost-price box silently
 * set `cost_price` to null and clearing the discount box reset the discount to 0
 * — the admin retyped a price, hit save, and lost data they never touched.
 * Tracking which fields the admin actually edited is what makes "leave blank to
 * keep" true, and it is also what lets the same form be used for a partial save.
 */
const OPTIONAL_NUMERIC_FIELDS = [
  "costPrice",
  "originalPrice",
  "discountPercent",
  "stock",
  "batchNumber",
  "expiryDate",
] as const;

type OptionalField = (typeof OPTIONAL_NUMERIC_FIELDS)[number];

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
  const shadows = useShadows();
  const isEditing = Boolean(product);

  // Generated once per form instance. Images upload to `products/<id>`, so the
  // id has to exist before the product row does.
  const [productId] = useState(() => product?.id ?? randomUuid());

  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [genericName, setGenericName] = useState(product?.genericName ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [manufacturerId, setManufacturerId] = useState(product?.manufacturerId ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "pack");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [costPrice, setCostPrice] = useState(
    product?.costPrice != null ? String(product.costPrice) : "",
  );
  const [originalPrice, setOriginalPrice] = useState(
    product?.originalPrice ? String(product.originalPrice) : "",
  );
  const [discountPercent, setDiscountPercent] = useState(
    product?.discountPercent ? String(product.discountPercent) : "",
  );
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [primaryImage, setPrimaryImage] = useState<string | null>(
    product?.primaryImage ?? product?.image ?? null,
  );
  const [secondaryImage, setSecondaryImage] = useState<string | null>(
    product?.secondaryImage ?? null,
  );
  const [batchNumber, setBatchNumber] = useState(product?.batchNumber ?? "");
  const [expiryDate, setExpiryDate] = useState(product?.expiryDate ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(product?.batchNumber || product?.expiryDate),
  );

  // Local copies so an option created inline is selectable straight away, even
  // before the screen's next fetch brings it back.
  const [cats, setCats] = useState<Category[]>(categories);
  const [mans, setMans] = useState<Manufacturer[]>(manufacturers);

  const [touched, setTouched] = useState<Partial<Record<OptionalField, boolean>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const markTouched = (field: OptionalField) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  // Images upload the moment they are picked, so the URL — not the local file —
  // is what the form holds and what gets saved.
  const [uploadingSlot, setUploadingSlot] = useState<"primary" | "secondary" | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [manufacturerAddOpen, setManufacturerAddOpen] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState("");
  const [newManufacturerError, setNewManufacturerError] = useState<string | null>(null);
  const [addingManufacturer, setAddingManufacturer] = useState(false);

  // A newly created option must be selectable even if the current search term
  // would filter it out of the fetched list.
  const categoryOptions = useMemo<SelectOption[]>(
    () => cats.map((c) => ({ label: c.name, value: c.id })),
    [cats],
  );
  const manufacturerOptions = useMemo<SelectOption[]>(
    () => mans.map((m) => ({ label: m.name, value: m.id })),
    [mans],
  );

  const validate = useMemo(() => {
    const next: Record<string, string> = {};

    if (isEmpty(name)) next.name = "Product name is required.";
    if (isEmpty(brand)) next.brand = "Brand is required.";
    if (isEmpty(genericName)) next.genericName = "Generic name is required.";
    if (!categoryId) next.categoryId = "Select a category.";
    if (!manufacturerId) next.manufacturerId = "Select a manufacturer.";
    if (isEmpty(unit)) next.unit = "Unit is required.";
    if (isEmpty(description)) next.description = "Description is required.";

    const priceNum = Number(price);
    if (isEmpty(price)) next.price = "Price is required.";
    else if (Number.isNaN(priceNum) || priceNum <= 0) next.price = "Enter a valid price.";

    const costNum = costPrice ? Number(costPrice) : NaN;
    if (costPrice) {
      if (Number.isNaN(costNum) || costNum < 0) next.costPrice = "Enter a valid cost price.";
      else if (!isEmpty(price) && !Number.isNaN(priceNum) && costNum > priceNum)
        next.costPrice = "Cost cannot exceed selling price.";
    }

    const originalNum = originalPrice ? Number(originalPrice) : NaN;
    if (originalPrice && (Number.isNaN(originalNum) || originalNum <= 0))
      next.originalPrice = "Enter a valid original price.";

    const discountNum = discountPercent ? Number(discountPercent) : NaN;
    if (discountPercent) {
      if (Number.isNaN(discountNum)) next.discountPercent = "Enter a valid discount.";
      else if (discountNum < 0 || discountNum > 99)
        next.discountPercent = "Discount must be 0-99%.";
      // The database rejects discount > 0 without an original price
      // (check_discount trigger → RPC 400), so block it here with a message
      // instead of a failed upload.
      else if (!originalPrice)
        next.discountPercent = "Add an original price, or leave discount empty.";
    }

    // PostgREST casts p_expiry_date to date before create_product runs, so
    // anything that is not YYYY-MM-DD is a 400 with no row written. Date.parse
    // accepts slashes and other spellings Postgres rejects, hence the strict check.

    // Stock is required when creating, optional when editing (leave it alone
    // unless the admin actually changed it).
    if (isEditing && !touched.stock) {
      // no validation
    } else if (isEmpty(stock)) {
      next.stock = "Stock is required.";
    } else {
      const stockNum = Number(stock);
      if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum))
        next.stock = "Enter a valid whole number.";
    }

    if (expiryDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim()))
        next.expiryDate = "Use YYYY-MM-DD (e.g. 2027-05-12).";
      else if (Number.isNaN(Date.parse(expiryDate.trim())))
        next.expiryDate = "Enter a valid date (e.g. 2027-05-12).";
    }

    return next;
  }, [
    name, brand, genericName, categoryId, manufacturerId, unit, description,
    price, costPrice, originalPrice, discountPercent, stock, expiryDate,
    isEditing, touched.stock,
  ]);

  const handleSubmit = async () => {
    const validation = validate;
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      // An untouched stock box means "keep the stored total", which the partial
      // update expresses by keeping the key out of the payload entirely.
      const untouchedStock = isEditing && !touched.stock ? product?.stock : undefined;

      const payload: ProductFormInput = {
        name: name.trim(),
        brand: brand.trim(),
        genericName: genericName.trim(),
        manufacturerId,
        categoryId,
        description: description.trim(),
        price: Number(price),
        stock: untouchedStock ?? Number(stock),
        unit: unit.trim(),
        primaryImage,
        secondaryImage,
        isActive,
        isFeatured,
      };

      if (!isEditing) payload.id = productId;

      // Same rule for the other optional fields: absent when the admin never
      // touched them, `null` when they were cleared on purpose.
      if (!isEditing || touched.costPrice)
        payload.costPrice = costPrice ? Number(costPrice) : null;
      if (!isEditing || touched.originalPrice)
        payload.originalPrice = originalPrice ? Number(originalPrice) : null;
      if (!isEditing || touched.discountPercent)
        payload.discountPercent = discountPercent ? Number(discountPercent) : null;
      if (!isEditing || touched.batchNumber) payload.batchNumber = batchNumber.trim() || null;
      if (!isEditing || touched.expiryDate) payload.expiryDate = expiryDate.trim() || null;

      await onSubmit(payload);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not save the product. Please try again.",
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
      setCats((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
      setCategoryId(created.id);
      setNewCategoryName("");
      setCategoryAddOpen(false);
    } catch (err) {
      setNewCategoryError(err instanceof Error ? err.message : "Could not add the category.");
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
      setMans((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
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
  const handlePickImage = async (localUri: string, slot: "primary" | "secondary") => {
    setUploadingSlot(slot);
    setImageError(null);
    try {
      const url = await onUploadImage(localUri, slot, productId);
      if (slot === "primary") setPrimaryImage(url);
      else setSecondaryImage(url);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not upload the image.");
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
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
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
        style={[styles.addToggle, { borderColor: colors.borderLight, backgroundColor: colors.backgroundAlt }]}
        accessibilityRole="button"
      >
        <Text style={[styles.addToggleText, { color: colors.primary }]}>
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
            style={[styles.inlineButton, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.inlineButtonText, { color: colors.white }]}>
              {busy ? "Adding…" : "Add"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const busy = saving || uploadingSlot !== null;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.form,
            { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight, ...shadows.sm },
          ]}
        >
          {SECTION("Basics")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Product name"
                value={name}
                onChangeText={setName}
                error={errors.name}
                placeholder="e.g. Paracetamol 500mg"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Brand"
                value={brand}
                onChangeText={setBrand}
                error={errors.brand}
                placeholder="e.g. Panadol"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Generic name"
                value={genericName}
                onChangeText={setGenericName}
                error={errors.genericName}
                placeholder="e.g. Paracetamol"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Unit"
                value={unit}
                onChangeText={setUnit}
                error={errors.unit}
                placeholder="pack, bottle, tube"
              />
            </View>
          </View>

          <View style={styles.row}>
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
                placeholder="Select a category"
                error={errors.categoryId}
                footer={addFooter(
                  categoryAddOpen,
                  () => setCategoryAddOpen((v) => !v),
                  "Add category",
                  "Hide",
                  "New category name",
                  "e.g. Pain Relief",
                  newCategoryName,
                  setNewCategoryName,
                  newCategoryError,
                  handleAddCategory,
                  addingCategory,
                )}
              />
            </View>
            <View style={styles.field}>
              <SearchableSelect
                label="Manufacturer"
                value={manufacturerId || undefined}
                options={manufacturerOptions}
                onSelect={setManufacturerId}
                onSearch={onSearchManufacturers}
                loading={manufacturersLoading}
                searchPlaceholder="Search manufacturers"
                emptyMessage="No manufacturers match. Add one below."
                placeholder="Select a manufacturer"
                error={errors.manufacturerId}
                footer={addFooter(
                  manufacturerAddOpen,
                  () => setManufacturerAddOpen((v) => !v),
                  "Add manufacturer",
                  "Hide",
                  "New manufacturer name",
                  "e.g. Square Pharmaceuticals",
                  newManufacturerName,
                  setNewManufacturerName,
                  newManufacturerError,
                  handleAddManufacturer,
                  addingManufacturer,
                )}
              />
            </View>
          </View>

          {SECTION("Pricing & stock")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Price"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                error={errors.price}
                placeholder="0.00"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Cost price"
                value={costPrice}
                onChangeText={(v) => {
                  setCostPrice(v);
                  markTouched("costPrice");
                }}
                keyboardType="decimal-pad"
                error={errors.costPrice}
                placeholder="Optional · e.g. 320"
                hint={isEditing ? "Left untouched, the current cost is kept." : undefined}
              />
            </View>
          </View>
          {costPrice || price ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {(() => {
                const p = Number(price);
                const c = Number(costPrice);
                if (!p || Number.isNaN(p) || !c || Number.isNaN(c))
                  return "Leave cost empty to auto-set price×0.8";
                const margin = ((p - c) / p) * 100;
                return `Margin ${margin.toFixed(1)}% · Profit ${c < p ? `৳ ${(p - c).toFixed(2)}` : "—"} per unit`;
              })()}
            </Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Original price"
                value={originalPrice}
                onChangeText={(v) => {
                  setOriginalPrice(v);
                  markTouched("originalPrice");
                }}
                keyboardType="decimal-pad"
                error={errors.originalPrice}
                placeholder="Optional"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Discount (%)"
                value={discountPercent}
                onChangeText={(v) => {
                  setDiscountPercent(v);
                  markTouched("discountPercent");
                }}
                keyboardType="numeric"
                error={errors.discountPercent}
                placeholder="Optional"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Stock"
                value={stock}
                onChangeText={(v) => {
                  setStock(v);
                  markTouched("stock");
                }}
                keyboardType="numeric"
                error={errors.stock}
                placeholder="0"
                hint={isEditing ? "Left untouched, the current batches are kept." : undefined}
              />
            </View>
            <View style={styles.field} />
          </View>

          <Pressable
            onPress={() => setShowAdvanced((v) => !v)}
            style={[
              styles.advancedToggle,
              {
                borderColor: colors.borderLight,
                backgroundColor: showAdvanced ? colors.background : colors.backgroundAlt,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              showAdvanced ? "Hide advanced batch options" : "Show advanced batch options"
            }
          >
            <Text
              style={[
                styles.advancedToggleText,
                { color: showAdvanced ? colors.primary : colors.textMuted },
              ]}
            >
              {showAdvanced
                ? "▲ Advanced · batch & expiry"
                : "▼ Advanced · batch & expiry (auto if empty)"}
            </Text>
          </Pressable>
          {showAdvanced ? (
            <>
              {SECTION("Batch · auto-handled")}
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Leave empty to auto-generate BATCH-XXXX-001 and skip expiry. Stock is the sum of
                batches — no ID handling needed.
              </Text>
              <View style={styles.row}>
                <View style={styles.field}>
                  <Input
                    label="Batch number"
                    value={batchNumber}
                    onChangeText={(v) => {
                      setBatchNumber(v);
                      markTouched("batchNumber");
                    }}
                    error={errors.batchNumber}
                    placeholder="Auto: BATCH-XXXXXXXX-001"
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Expiry date"
                    value={expiryDate}
                    onChangeText={(v) => {
                      setExpiryDate(v);
                      markTouched("expiryDate");
                    }}
                    placeholder="YYYY-MM-DD (optional)"
                    error={errors.expiryDate}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </>
          ) : null}

          {SECTION("Images")}

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Picked images upload to Cloudinary right away and replace the previous file for this
            product. All product text and numbers are saved to the database.
          </Text>

          <View style={styles.imageRow}>
            <View style={styles.imageSlot}>
              <ImageUpload
                label="Primary image (optional)"
                uri={primaryImage}
                uploading={uploadingSlot === "primary"}
                onPick={(uri) => void handlePickImage(uri, "primary")}
                onRemove={() => handleRemoveImage("primary")}
              />
            </View>
            <View style={styles.imageSlot}>
              <ImageUpload
                label="Secondary image (optional)"
                uri={secondaryImage}
                uploading={uploadingSlot === "secondary"}
                onPick={(uri) => void handlePickImage(uri, "secondary")}
                onRemove={() => handleRemoveImage("secondary")}
              />
            </View>
          </View>
          {imageError && !uploadingSlot ? (
            <Text style={[styles.error, { color: colors.danger }]}>{imageError}</Text>
          ) : null}

          <View style={styles.field}>
            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
              error={errors.description}
              placeholder="Product summary shown to customers"
            />
          </View>

          <View style={[styles.switches, { borderTopColor: colors.borderLight }]}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>Active</Text>
                <Text style={[styles.switchHint, { color: colors.textMuted }]}>
                  Visible to customers and search
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={isActive ? colors.primary : colors.textMuted}
                accessibilityLabel="Active"
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>Featured</Text>
                <Text style={[styles.switchHint, { color: colors.textMuted }]}>
                  Shown in trending sections
                </Text>
              </View>
              <Switch
                value={isFeatured}
                onValueChange={setIsFeatured}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={isFeatured ? colors.primary : colors.textMuted}
                accessibilityLabel="Featured"
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { borderTopColor: colors.borderLight, backgroundColor: colors.background },
        ]}
      >
        {submitError ? (
          <Text style={[styles.submitError, { color: colors.danger }]}>{submitError}</Text>
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
            Only the fields you change are saved.
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
    paddingBottom: spacing.xxl,
    alignSelf: "center",
    width: "100%",
    maxWidth: 720,
  },
  form: {
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: sizes.cardRadius,
    padding: spacing.lg,
  },
  sectionLabel: {
    fontSize: typography.label,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: spacing.sm,
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
  group: { gap: spacing.sm },
  addToggle: {
    borderWidth: 1,
    borderRadius: sizes.cardRadius,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignSelf: "flex-start",
  },
  addToggleText: { fontSize: typography.caption, fontWeight: "700" },
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
  inlineButtonText: { fontSize: typography.bodySmall, fontWeight: "700" },
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
  switchLabel: { fontSize: typography.bodySmall, fontWeight: "600" },
  switchHint: { fontSize: typography.caption },
  hint: { fontSize: typography.caption, marginTop: -spacing.xs, marginBottom: spacing.xs },
  advancedToggle: {
    borderWidth: 1,
    borderRadius: sizes.cardRadius,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  advancedToggleText: { fontSize: typography.caption, fontWeight: "600" },
  error: { fontSize: typography.caption },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  submitError: {
    fontSize: typography.bodySmall,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  note: {
    fontSize: typography.caption,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
