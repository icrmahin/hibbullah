import { useMemo, useState } from "react";
import {
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
import type { Product } from "../../types/product";
import { getSalePrice } from "../../utils/currency";
import { randomUuid } from "../../utils/uuid";
import { isEmpty, parseDiscountPercent } from "../../utils/validation";
import Button from "../common/Button";
import Chip from "../common/Chip";
import ImageUpload from "../common/ImageUpload";
import Input from "../common/Input";

export type ProductFormInput = ProductUpdate & {
  id?: string;
  name: string;
  companyName: string;
  categoryId: string | null;
  description: string;
  price: number;
  stock: number;
  unit: string;
  isActive: boolean;
};

type ProductFormProps = {
  product?: Product;
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

const SOLD_AS = [
  { label: "Pack", value: "pack" },
  { label: "Bottle", value: "bottle" },
  { label: "Box", value: "box" },
] as const;

type OptionalField = "costPrice" | "stock" | "expiryDate";

export default function ProductForm({
  product,
  onUploadImage,
  submitLabel,
  onSubmit,
}: ProductFormProps) {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const isEditing = Boolean(product);

  const [productId] = useState(() => product?.id ?? randomUuid());

  const [name, setName] = useState(product?.name ?? "");
  const [companyName, setCompanyName] = useState(product?.companyName ?? "");
  const [categoryName, setCategoryName] = useState(product?.categoryName ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "pack");
  const [description, setDescription] = useState(product?.description ?? "");
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

  const [touched, setTouched] = useState<Partial<Record<OptionalField, boolean>>>(
    {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const markTouched = (field: OptionalField) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const [uploadingSlot, setUploadingSlot] = useState<
    "primary" | "secondary" | null
  >(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const parsedDiscount = parseDiscountPercent(discountPercent);
  const discountValue = parsedDiscount.ok ? parsedDiscount.percent : 0;
  const customerPrice = Number(price);

  const validate = useMemo(() => {
    const next: Record<string, string> = {};

    if (isEmpty(name)) next.name = "Write the medicine name.";

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
      else if (!isEmpty(price) && !Number.isNaN(priceNum) && costNum > priceNum)
        next.costPrice =
          "That is more than the customer price, so check the two numbers.";
    }

    if (isEditing && !touched.stock) {
      // no validation
    } else if (isEmpty(stock)) {
      next.stock = "Write how many you have.";
    } else {
      const stockNum = Number(stock);
      if (Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum))
        next.stock = "Write a whole number.";
    }

    if (expiryDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim()))
        next.expiryDate =
          "Write it as 2027-05-12 — four digits for the year, then two, then two.";
      else if (Number.isNaN(Date.parse(expiryDate.trim())))
        next.expiryDate = "That is not a real date. Write it as 2027-05-12.";
    }

    if (!primaryImage)
      next.primaryImage = "Add a photo of the medicine — it is how customers find it.";

    return next;
  }, [
    name,
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
      setSubmitError("Please fix the fields marked above.");
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      const untouchedStock =
        isEditing && !touched.stock ? product?.stock : undefined;

      const percent = discountValue;

      // Resolve category: empty → null, non-empty → find or create (case-insensitive)
      const trimmedCategory = categoryName.trim();
      let resolvedCategoryId: string | null = null;
      if (trimmedCategory) {
        const { findCategoryByName, createCategory } = await import("../../services/products");
        const existing = await findCategoryByName(trimmedCategory);
        if (existing) {
          resolvedCategoryId = existing.id;
        } else {
          const created = await createCategory({ name: trimmedCategory });
          resolvedCategoryId = created.id;
        }
      }

      const payload: ProductFormInput = {
        name: name.trim(),
        companyName: companyName.trim(),
        categoryId: resolvedCategoryId,
        description: description.trim(),
        price:
          percent > 0 ? getSalePrice(customerPrice, percent) : customerPrice,
        stock: untouchedStock ?? Number(stock),
        unit: unit.trim() || "pack",
        primaryImage,
        secondaryImage,
        isActive,
        isFeatured,
        originalPrice: percent > 0 ? customerPrice : null,
        discountPercent: percent > 0 ? percent : null,
      };

      if (!isEditing) payload.id = productId;

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

  const handleRemoveImage = (slot: "primary" | "secondary") => {
    if (slot === "primary") setPrimaryImage(null);
    else setSecondaryImage(null);
  };

  const SECTION = (label: string) => (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
      {label}
    </Text>
  );

  const busy = saving || uploadingSlot !== null;

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
        <View style={[styles.form, { backgroundColor: colors.backgroundAlt }]}>
          {SECTION("1 · The medicine")}

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Medicine name"
                value={name}
                onChangeText={setName}
                error={errors.name}
                placeholder="e.g. Napa Extra 500 mg"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Company"
                value={companyName}
                onChangeText={setCompanyName}
                error={errors.companyName}
                placeholder="e.g. Square Pharmaceuticals"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Category (optional)"
                value={categoryName}
                onChangeText={setCategoryName}
                error={errors.categoryId}
                placeholder="e.g. Pain relief"
                autoCapitalize="words"
              />
            </View>
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
                value={discountPercent}
                onChangeText={setDiscountPercent}
                error={errors.discountPercent}
                placeholder="Optional"
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Admin price"
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

          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Expiry date"
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
  sectionLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    marginTop: spacing.sm,
  },
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
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.xs,
  },
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
});
