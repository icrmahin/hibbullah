import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import colors from "../../constants/colors";
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

export type ProductFormInput = Omit<Product, "id" | "createdAt">;

type ProductFormProps = {
  product?: Product;
  categories: Category[];
  manufacturers: Manufacturer[];
  submitLabel: string;
  onSubmit: (input: ProductFormInput) => Promise<void>;
};

const SECTION = (label: string) => (
  <Text style={styles.sectionLabel}>{label}</Text>
);

export default function ProductForm({
  product,
  categories,
  manufacturers,
  submitLabel,
  onSubmit,
}: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [genericName, setGenericName] = useState(product?.genericName ?? "");
  const [categoryId, setCategoryId] = useState(
    product?.categoryId ?? categories[0]?.id ?? "",
  );
  const [manufacturerId, setManufacturerId] = useState(
    product?.manufacturerId ?? manufacturers[0]?.id ?? "",
  );
  const [unit, setUnit] = useState(product?.unit ?? "pack");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
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

    const originalNum = originalPrice ? Number(originalPrice) : NaN;
    if (originalPrice && (Number.isNaN(originalNum) || originalNum <= 0))
      next.originalPrice = "Enter a valid original price.";

    const discountNum = discountPercent ? Number(discountPercent) : NaN;
    if (discountPercent) {
      if (Number.isNaN(discountNum)) next.discountPercent = "Enter a valid discount.";
      else if (discountNum < 0 || discountNum > 99)
        next.discountPercent = "Discount must be 0–99%.";
    }

    const stockNum = Number(stock);
    if (isEmpty(stock)) next.stock = "Stock is required.";
    else if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum))
      next.stock = "Enter a valid whole number.";

    if (image && !/^https?:\/\/.+/.test(image)) next.image = "Enter a valid image URL.";

    if (expiryDate && Number.isNaN(Date.parse(expiryDate)))
      next.expiryDate = "Enter a valid date (e.g. 2027-05-12).";

    return next;
  }, [
    name,
    brand,
    genericName,
    categoryId,
    manufacturerId,
    unit,
    description,
    price,
    originalPrice,
    discountPercent,
    stock,
    image,
    expiryDate,
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

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
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
            <Text style={styles.groupLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  label={category.name}
                  selected={categoryId === category.id}
                  onPress={() => setCategoryId(category.id)}
                />
              ))}
            </ScrollView>
            {errors.categoryId ? <Text style={styles.error}>{errors.categoryId}</Text> : null}
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Manufacturer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {manufacturers.map((manufacturer) => (
                <FilterChip
                  key={manufacturer.id}
                  label={manufacturer.name}
                  selected={manufacturerId === manufacturer.id}
                  onPress={() => setManufacturerId(manufacturer.id)}
                />
              ))}
            </ScrollView>
            {errors.manufacturerId ? <Text style={styles.error}>{errors.manufacturerId}</Text> : null}
          </View>

          {SECTION("Pricing & stock")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" error={errors.price} placeholder="0.00" />
            </View>
            <View style={styles.field}>
              <Input label="Original price" value={originalPrice} onChangeText={setOriginalPrice} keyboardType="decimal-pad" error={errors.originalPrice} placeholder="Optional" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Discount (%)" value={discountPercent} onChangeText={setDiscountPercent} keyboardType="numeric" error={errors.discountPercent} placeholder="Optional" />
            </View>
            <View style={styles.field}>
              <Input label="Stock" value={stock} onChangeText={setStock} keyboardType="numeric" error={errors.stock} placeholder="0" />
            </View>
          </View>

          {SECTION("Batch")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input label="Batch number" value={batchNumber} onChangeText={setBatchNumber} error={errors.batchNumber} placeholder="Optional" />
            </View>
            <View style={styles.field}>
              <Input label="Expiry date" value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" error={errors.expiryDate} autoCapitalize="none" />
            </View>
          </View>

          {SECTION("Listing")}

          <View style={styles.imageSection}>
            <View style={styles.imageRow}>
              <View style={styles.imageSlot}>
                <ImageUpload
                  label="Primary image"
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
                  label="Secondary image"
                  uri={secondaryImage || null}
                  onPick={setSecondaryImage}
                  onRemove={() => setSecondaryImage("")}
                />
              </View>
            </View>
            {errors.image ? <Text style={styles.error}>{errors.image}</Text> : null}
          </View>

          <View style={styles.field}>
            <Input label="Image URL (fallback)" value={image} onChangeText={setImage} error={errors.image} placeholder="https://…" autoCapitalize="none" autoCorrect={false} />
          </View>

          <View style={styles.field}>
            <Input label="Description" value={description} onChangeText={setDescription} multiline error={errors.description} placeholder="Product summary shown to customers" />
          </View>

          <View style={styles.switches}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchLabel}>Active</Text>
                <Text style={styles.switchHint}>Visible to customers and search</Text>
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
                <Text style={styles.switchLabel}>Featured</Text>
                <Text style={styles.switchHint}>Shown in trending sections</Text>
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

      <View style={styles.footer}>
        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
        <Button
          title={saving ? "Saving…" : submitLabel}
          onPress={handleSubmit}
          loading={saving}
          fullWidth
        />
      </View>

      {isEditing ? (
        <Text style={styles.note}>
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
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: sizes.cardRadius,
    padding: spacing.lg,
  },
  sectionLabel: {
    color: colors.textMuted,
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
    color: colors.text,
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
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
    borderTopColor: colors.borderSoft,
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
    color: colors.text,
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  switchHint: { color: colors.textMuted, fontSize: typography.caption },
  error: { color: colors.danger, fontSize: typography.caption },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  submitError: {
    color: colors.danger,
    fontSize: typography.bodySmall,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  note: {
    color: colors.textMuted,
    fontSize: typography.caption,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});