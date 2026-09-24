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
import { isEmpty } from "../../utils/validation";
import Button from "../common/Button";
import FilterChip from "../common/FilterChip";
import ImageUpload from "../common/ImageUpload";
import Input from "../common/Input";
import { createCategory, createManufacturer } from "../../services/products";
import { normalizeError } from "../../utils/errorHandling";

export type ProductFormInput = Omit<Product, "id" | "createdAt">;

type ProductFormProps = {
  product?: Product;
  categories: Category[];
  manufacturers: Manufacturer[];
  submitLabel: string;
  onSubmit: (input: ProductFormInput) => Promise<void>;
};

export default function ProductForm({
  product,
  categories,
  manufacturers,
  submitLabel,
  onSubmit,
}: ProductFormProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [genericName, setGenericName] = useState(product?.genericName ?? "");
  const [categoryId, setCategoryId] = useState(
    product?.categoryId ?? categories[0]?.id ?? "",
  );
  const [manufacturerId, setManufacturerId] = useState(
    product?.manufacturerId ?? manufacturers[0]?.id ?? "",
  );

  // Local copies so admins can create categories/manufacturers inline (the DB
  // starts empty, and the chip strip would otherwise render nothing to pick).
  const [cats, setCats] = useState<Category[]>(categories);
  const [mans, setMans] = useState<Manufacturer[]>(manufacturers);

  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [manufacturerAddOpen, setManufacturerAddOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newManufacturerName, setNewManufacturerName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [newManufacturerError, setNewManufacturerError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingManufacturer, setAddingManufacturer] = useState(false);
  const [unit, setUnit] = useState(product?.unit ?? "pack");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [costPrice, setCostPrice] = useState(product?.costPrice != null ? String(product.costPrice) : "");
  const [originalPrice, setOriginalPrice] = useState(
    product?.originalPrice ? String(product.originalPrice) : "",
  );
  const [discountPercent, setDiscountPercent] = useState(
    product?.discountPercent ? String(product.discountPercent) : "",
  );
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [image, setImage] = useState(product?.image ?? "");
  const [primaryImage, setPrimaryImage] = useState(product?.primaryImage ?? product?.image ?? "");
  const [secondaryImage, setSecondaryImage] = useState(product?.secondaryImage ?? "");
  const [batchNumber, setBatchNumber] = useState(product?.batchNumber ?? "");
  const [expiryDate, setExpiryDate] = useState(product?.expiryDate ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(product?.batchNumber || product?.expiryDate));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEditing = Boolean(product);

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
    else if (Number.isNaN(priceNum) || priceNum <= 0)
      next.price = "Enter a valid price.";

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
    }

    const stockNum = Number(stock);
    if (isEmpty(stock)) next.stock = "Stock is required.";
    else if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum))
      next.stock = "Enter a valid whole number.";

    if (image && !/^(https?:\/\/|file:\/\/|content:\/\/|blob:|data:|ph:\/\/).+/.test(image)) next.image = "Enter a valid image URL or pick an image.";

    if (expiryDate && Number.isNaN(Date.parse(expiryDate)))
      next.expiryDate = "Enter a valid date (e.g. 2027-05-12).";

    return next;
  }, [
    name, brand, genericName, categoryId, manufacturerId, unit, description,
    price, costPrice, originalPrice, discountPercent, stock, image, expiryDate,
  ]);

  const handleSubmit = async () => {
    const validation = validate;
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit({
        name: name.trim(),
        brand: brand.trim(),
        genericName: genericName.trim(),
        manufacturerId,
        categoryId,
        description: description.trim(),
        price: Number(price),
        costPrice: costPrice ? Number(costPrice) : undefined,
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        stock: Number(stock),
        unit: unit.trim(),
        image: image.trim() || undefined,
        primaryImage: primaryImage.trim() || undefined,
        secondaryImage: secondaryImage.trim() || undefined,
        isActive,
        isFeatured,
        batchNumber: batchNumber.trim() || undefined,
        expiryDate: expiryDate.trim() || undefined,
      });
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
    const name = newCategoryName.trim();
    if (!name) {
      setNewCategoryError("Category name is required.");
      return;
    }
    setAddingCategory(true);
    setNewCategoryError(null);
    try {
      const created = await createCategory({ name });
      setCats((prev) => [...prev, created]);
      setCategoryId(created.id);
      setNewCategoryName("");
      setCategoryAddOpen(false);
    } catch (err) {
      setNewCategoryError(normalizeError(err).message);
    } finally {
      setAddingCategory(false);
    }
  };

  const handleAddManufacturer = async () => {
    const name = newManufacturerName.trim();
    if (!name) {
      setNewManufacturerError("Manufacturer name is required.");
      return;
    }
    setAddingManufacturer(true);
    setNewManufacturerError(null);
    try {
      const created = await createManufacturer({ name });
      setMans((prev) => [...prev, created]);
      setManufacturerId(created.id);
      setNewManufacturerName("");
      setManufacturerAddOpen(false);
    } catch (err) {
      setNewManufacturerError(normalizeError(err).message);
    } finally {
      setAddingManufacturer(false);
    }
  };

  const SECTION = (label: string) => (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
  );

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.form, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight, ...shadows.sm }]}>
          {SECTION("Basics")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Product name" value={name} onChangeText={setName} error={errors.name} placeholder="e.g. Paracetamol 500mg" />
            </View>
            <View style={styles.field}>
              <Input label="Brand" value={brand} onChangeText={setBrand} error={errors.brand} placeholder="e.g. Panadol" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Generic name" value={genericName} onChangeText={setGenericName} error={errors.genericName} placeholder="e.g. Paracetamol" />
            </View>
            <View style={styles.field}>
              <Input label="Unit" value={unit} onChangeText={setUnit} error={errors.unit} placeholder="pack, bottle, tube" />
            </View>
          </View>

          <View style={styles.group}>
            <Text style={[styles.groupLabel, { color: colors.text }]}>Category</Text>
            {cats.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {cats.map((category) => (
                  <FilterChip
                    key={category.id}
                    label={category.name}
                    selected={categoryId === category.id}
                    onPress={() => setCategoryId(category.id)}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
                No categories yet — create the first one below.
              </Text>
            )}
            {errors.categoryId && cats.length > 0 ? <Text style={[styles.error, { color: colors.danger }]}>{errors.categoryId}</Text> : null}

            <Pressable
              onPress={() => setCategoryAddOpen((v) => !v)}
              style={[styles.addToggle, { borderColor: colors.borderLight, backgroundColor: colors.backgroundAlt }]}
              accessibilityRole="button"
            >
              <Text style={[styles.addToggleText, { color: colors.primary }]}>
                {categoryAddOpen ? "▲ Hide" : "＋ Add category"}
              </Text>
            </Pressable>
            {categoryAddOpen ? (
              <View style={styles.inlineRow}>
                <View style={styles.inlineField}>
                  <Input
                    label="New category name"
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    placeholder="e.g. Pain Relief"
                    error={newCategoryError ?? undefined}
                    autoCapitalize="words"
                  />
                </View>
                <Pressable
                  onPress={handleAddCategory}
                  disabled={addingCategory}
                  style={[styles.inlineButton, { backgroundColor: colors.primary, opacity: addingCategory ? 0.6 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.inlineButtonText, { color: colors.white }]}>
                    {addingCategory ? "Adding…" : "Add"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.group}>
            <Text style={[styles.groupLabel, { color: colors.text }]}>Manufacturer</Text>
            {mans.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {mans.map((manufacturer) => (
                  <FilterChip
                    key={manufacturer.id}
                    label={manufacturer.name}
                    selected={manufacturerId === manufacturer.id}
                    onPress={() => setManufacturerId(manufacturer.id)}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
                No manufacturers yet — create the first one below.
              </Text>
            )}
            {errors.manufacturerId && mans.length > 0 ? <Text style={[styles.error, { color: colors.danger }]}>{errors.manufacturerId}</Text> : null}

            <Pressable
              onPress={() => setManufacturerAddOpen((v) => !v)}
              style={[styles.addToggle, { borderColor: colors.borderLight, backgroundColor: colors.backgroundAlt }]}
              accessibilityRole="button"
            >
              <Text style={[styles.addToggleText, { color: colors.primary }]}>
                {manufacturerAddOpen ? "▲ Hide" : "＋ Add manufacturer"}
              </Text>
            </Pressable>
            {manufacturerAddOpen ? (
              <View style={styles.inlineRow}>
                <View style={styles.inlineField}>
                  <Input
                    label="New manufacturer name"
                    value={newManufacturerName}
                    onChangeText={setNewManufacturerName}
                    placeholder="e.g. Square Pharmaceuticals"
                    error={newManufacturerError ?? undefined}
                    autoCapitalize="words"
                  />
                </View>
                <Pressable
                  onPress={handleAddManufacturer}
                  disabled={addingManufacturer}
                  style={[styles.inlineButton, { backgroundColor: colors.primary, opacity: addingManufacturer ? 0.6 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.inlineButtonText, { color: colors.white }]}>
                    {addingManufacturer ? "Adding…" : "Add"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {SECTION("Pricing & stock")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" error={errors.price} placeholder="0.00" />
            </View>
            <View style={styles.field}>
              <Input label="Cost price" value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" error={errors.costPrice} placeholder="Optional · e.g. 320" />
            </View>
          </View>
          {costPrice || price ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {(() => {
                const p = Number(price);
                const c = Number(costPrice);
                if (!p || Number.isNaN(p) || !c || Number.isNaN(c)) return "Leave cost empty to auto-set price×0.8";
                const margin = ((p - c) / p) * 100;
                return `Margin ${margin.toFixed(1)}% · Profit ${c < p ? `৳ ${(p - c).toFixed(2)}` : "—"} per unit`;
              })()}
            </Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Original price" value={originalPrice} onChangeText={setOriginalPrice} keyboardType="decimal-pad" error={errors.originalPrice} placeholder="Optional" />
            </View>
            <View style={styles.field}>
              <Input label="Discount (%)" value={discountPercent} onChangeText={setDiscountPercent} keyboardType="numeric" error={errors.discountPercent} placeholder="Optional" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Stock" value={stock} onChangeText={setStock} keyboardType="numeric" error={errors.stock} placeholder="0" />
            </View>
            <View style={styles.field} />
          </View>

          <Pressable
            onPress={() => setShowAdvanced((v) => !v)}
            style={[styles.advancedToggle, { borderColor: colors.borderLight, backgroundColor: showAdvanced ? colors.background : colors.backgroundAlt }]}
            accessibilityRole="button"
            accessibilityLabel={showAdvanced ? "Hide advanced batch options" : "Show advanced batch options"}
          >
            <Text style={[styles.advancedToggleText, { color: showAdvanced ? colors.primary : colors.textMuted }]}>
              {showAdvanced ? "▲ Advanced · batch & expiry" : "▼ Advanced · batch & expiry (auto if empty)"}
            </Text>
          </Pressable>
          {showAdvanced ? (
            <>
              {SECTION("Batch · auto-handled")}
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Leave empty to auto-generate BATCH-XXXX-001 and skip expiry. Stock is sum of batches — no ID handling needed.
              </Text>
              <View style={styles.row}>
                <View style={styles.field}>
                  <Input label="Batch number" value={batchNumber} onChangeText={setBatchNumber} error={errors.batchNumber} placeholder="Auto: BATCH-XXXXXXXX-001" />
                </View>
                <View style={styles.field}>
                  <Input label="Expiry date" value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD (optional)" error={errors.expiryDate} autoCapitalize="none" />
                </View>
              </View>
            </>
          ) : null}

          {SECTION("Listing")}

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Images are optional — leave blank and a placeholder is shown to customers. Picked images upload to Cloudinary automatically.
          </Text>

          <View style={styles.imageSection}>
            <View style={styles.imageRow}>
              <View style={styles.imageSlot}>
                <ImageUpload
                  label="Primary image (optional)"
                  uri={primaryImage || null}
                  onPick={(uri) => {
                    setPrimaryImage(uri);
                    setImage(uri);
                  }}
                  onRemove={() => {
                    setPrimaryImage("");
                    setImage(secondaryImage || "");
                  }}
                />
              </View>
              <View style={styles.imageSlot}>
                <ImageUpload
                  label="Secondary image (optional)"
                  uri={secondaryImage || null}
                  onPick={setSecondaryImage}
                  onRemove={() => setSecondaryImage("")}
                />
              </View>
            </View>
            {errors.image ? <Text style={[styles.error, { color: colors.danger }]}>{errors.image}</Text> : null}
          </View>

          <View style={styles.field}>
            <Input label="Image URL (optional fallback)" value={image} onChangeText={setImage} error={errors.image} placeholder="Optional — leave blank for placeholder" autoCapitalize="none" autoCorrect={false} />
          </View>

          <View style={styles.field}>
            <Input label="Description" value={description} onChangeText={setDescription} multiline error={errors.description} placeholder="Product summary shown to customers" />
          </View>

          <View style={[styles.switches, { borderTopColor: colors.borderLight }]}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>Active</Text>
                <Text style={[styles.switchHint, { color: colors.textMuted }]}>Visible to customers and search</Text>
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
                <Text style={[styles.switchHint, { color: colors.textMuted }]}>Shown in trending sections</Text>
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

      <View style={[styles.footer, { borderTopColor: colors.borderLight, backgroundColor: colors.background }]}>
        {submitError ? <Text style={[styles.submitError, { color: colors.danger }]}>{submitError}</Text> : null}
        <Button
          title={saving ? "Saving..." : submitLabel}
          onPress={handleSubmit}
          loading={saving}
          fullWidth
        />
      </View>

      {isEditing ? (
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Leave optional fields blank to keep current values.
        </Text>
      ) : null}
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
  groupLabel: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
  emptyHint: { fontSize: typography.caption, fontStyle: "italic" },
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
  inlineField: {
    flex: 1,
  },
  inlineButton: {
    borderRadius: sizes.cardRadius,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  inlineButtonText: { fontSize: typography.bodySmall, fontWeight: "700" },
  imageSection: { gap: spacing.sm },
  imageRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  imageSlot: {
    flex: 1,
  },
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
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
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
    paddingBottom: spacing.lg,
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
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});