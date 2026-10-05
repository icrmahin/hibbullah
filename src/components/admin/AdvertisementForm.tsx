import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Button from "../common/Button";
import ConfirmDialog from "../common/ConfirmDialog";
import Toggle from "../common/Toggle";
import ImageUpload from "../common/ImageUpload";
import Input from "../common/Input";
import SearchableSelect from "../common/SearchableSelect";
import Select from "../common/Select";
import { useCategories, useManufacturers, useProducts } from "../../hooks/useProducts";
import { randomUuid } from "../../utils/uuid";
import { useBottomInset } from "../../hooks/useBottomInset";
import type { Advertisement, AdvertisementDestination, AdvertisementInput } from "../../types/advertisement";

type AdvertisementFormProps = {
  /** Present for an edit; absent for a new banner. */
  advertisement?: Advertisement;
  /**
   * Uploads the picked file and returns the stored URL. Uploading is the caller's job,
   * so this form holds no Cloudinary knowledge of its own.
   */
  onUploadImage: (localUri: string, advertisementId: string) => Promise<string>;
  submitLabel: string;
  onSubmit: (input: AdvertisementInput, advertisementId: string) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const DESTINATION_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Nothing — just a banner" },
  { value: "product", label: "A medicine" },
  { value: "category", label: "A category" },
  { value: "manufacturer", label: "A manufacturer" },
  { value: "url", label: "A website link" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `YYYY-MM-DD` -> an ISO instant at local midnight.
 *
 * Local rather than UTC on purpose: an owner types the day they mean in Dhaka, and
 * `new Date("2026-10-05")` would silently read that as UTC — six hours before the day
 * started. Returns null for anything that is not a real calendar date, including the
 * ones JavaScript would happily roll over (2026-02-31 becomes 2026-03-03).
 */
function dateTextToIso(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

/** The inverse: an ISO instant back to the day the owner typed, in their own timezone. */
function isoToDateText(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function AdvertisementForm({
  advertisement,
  onUploadImage,
  submitLabel,
  onSubmit,
  onDelete,
}: AdvertisementFormProps) {
  const colors = useThemeColors();

  // The banner's id exists before its row does, because the image is uploaded to
  // `<id>-p<suffix>` the moment it is picked. Same reasoning as ProductForm.
  const [advertisementId] = useState(() => advertisement?.id ?? randomUuid());

  const [title, setTitle] = useState(advertisement?.title ?? "");
  const [subtitle, setSubtitle] = useState(advertisement?.subtitle ?? "");
  const [imageUrl, setImageUrl] = useState(advertisement?.imageUrl ?? "");
  const [destinationType, setDestinationType] = useState<AdvertisementDestination>(
    advertisement?.destinationType ?? "none",
  );
  const [destinationId, setDestinationId] = useState(advertisement?.destinationId ?? "");
  const [sortOrder, setSortOrder] = useState(String(advertisement?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(advertisement?.isActive ?? true);
  const [startsAt, setStartsAt] = useState(isoToDateText(advertisement?.startsAt));
  const [endsAt, setEndsAt] = useState(isoToDateText(advertisement?.endsAt));

  const [productTerm, setProductTerm] = useState("");
  const [categoryTerm, setCategoryTerm] = useState("");
  const [manufacturerTerm, setManufacturerTerm] = useState("");

  const { data: products, loading: productsLoading } = useProducts({ query: productTerm, limit: 20 });
  const { data: categories, loading: categoriesLoading } = useCategories(categoryTerm);
  const { data: manufacturers, loading: manufacturersLoading } = useManufacturers(manufacturerTerm);

  const [imageUploading, setImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const bottomInset = useBottomInset();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * Upload on pick, not on save — the banner the admin chose appears immediately rather
   * than after a second round trip. Nothing is destroyed: an unsigned upload cannot
   * replace an asset, so the superseded one is reclaimed only once the row is saved.
   */
  const handlePickImage = async (localUri: string) => {
    setImageUploading(true);
    setFormError(null);
    try {
      const url = await onUploadImage(localUri, advertisementId);
      setImageUrl(url);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not upload the banner image.");
    } finally {
      setImageUploading(false);
    }
  };

  const validate = (): AdvertisementInput | null => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give the banner a title.";
    else if (title.trim().length > 80) next.title = "Keep the title to 80 characters.";
    if (subtitle.trim().length > 120) next.subtitle = "Keep the subtitle to 120 characters.";
    if (!imageUrl.trim()) next.image = "Add a banner image.";

    let startsIso: string | null = null;
    let endsIso: string | null = null;
    if (startsAt.trim()) {
      startsIso = dateTextToIso(startsAt);
      if (!startsIso) next.startsAt = "Write it as 2026-10-05.";
    }
    if (endsAt.trim()) {
      endsIso = dateTextToIso(endsAt);
      if (!endsIso) next.endsAt = "Write it as 2026-10-05.";
    }
    if (startsIso && endsIso && new Date(endsIso) < new Date(startsIso)) {
      next.endsAt = "The end date must not be before the start date.";
    }

    const order = Number(sortOrder.trim() || "0");
    if (!Number.isInteger(order) || order < 0) next.sortOrder = "Use a whole number, 0 or more.";

    // Mirrors the database's `advertisement_destination_matches_type`. Caught here so the
    // admin reads a sentence rather than a constraint name they never typed.
    const needsId = destinationType !== "none" && destinationType !== "url";
    if (needsId && !destinationId.trim()) {
      next.destinationId = "Pick what this banner leads to.";
    }
    if (destinationType === "url") {
      const url = destinationId.trim();
      if (!url) next.destinationId = "Paste the link this banner opens.";
      else if (!/^https?:\/\//i.test(url)) next.destinationId = "The link must start with http:// or https://";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      imageUrl: imageUrl.trim(),
      destinationType,
      destinationId: destinationType === "none" ? null : destinationId.trim(),
      sortOrder: order,
      isActive,
      startsAt: startsIso,
      endsAt: endsIso,
    };
  };

  const handleSubmit = async () => {
    const input = validate();
    if (!input) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit(input, advertisementId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the banner.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setConfirmingDelete(false);
    setDeleting(true);
    setFormError(null);
    try {
      await onDelete();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not delete the banner.");
    } finally {
      setDeleting(false);
    }
  };

  const section = (label: string) => (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
  );

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* One white card like the product form: the page colour does the framing. */}
        <View style={[styles.form, { backgroundColor: colors.backgroundAlt }]}>
          {section("Banner")}
      <ImageUpload
        label="Banner image"
        variant="full"
        uri={imageUrl || null}
        uploading={imageUploading}
        error={errors.image}
        onPick={(uri) => void handlePickImage(uri)}
        onRemove={() => setImageUrl("")}
      />
      <Input
        label="Title"
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        placeholder="Free blood pressure check"
        maxLength={80}
      />
      <Input
        label="Subtitle"
        value={subtitle}
        onChangeText={setSubtitle}
        error={errors.subtitle}
        placeholder="This week only"
        hint="Optional — one short line under the title."
        maxLength={120}
      />

      {section("Where it leads")}
      <Select
        label="Destination"
        value={destinationType}
        options={DESTINATION_OPTIONS}
        onSelect={(value) => {
          setDestinationType(value as AdvertisementDestination);
          setDestinationId("");
          setErrors((prev) => ({ ...prev, destinationId: "" }));
        }}
      />
      {destinationType === "url" ? (
        <Input
          label="Link"
          value={destinationId}
          onChangeText={setDestinationId}
          error={errors.destinationId}
          placeholder="https://hibbullah.com.bd/offers"
          autoCapitalize="none"
          keyboardType="url"
        />
      ) : null}
      {destinationType === "product" ? (
        <SearchableSelect
          label="Medicine"
          value={destinationId || undefined}
          selectedLabel={products.find((p) => p.id === destinationId)?.name}
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          onSelect={setDestinationId}
          onSearch={setProductTerm}
          loading={productsLoading}
          placeholder="Choose a medicine"
          searchPlaceholder="Search medicines"
          emptyMessage="No medicines match."
          error={errors.destinationId}
        />
      ) : null}
      {destinationType === "category" ? (
        <SearchableSelect
          label="Category"
          value={destinationId || undefined}
          selectedLabel={categories.find((c) => c.id === destinationId)?.name}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onSelect={setDestinationId}
          onSearch={setCategoryTerm}
          loading={categoriesLoading}
          placeholder="Choose a category"
          searchPlaceholder="Search categories"
          emptyMessage="No categories match."
          error={errors.destinationId}
        />
      ) : null}
      {destinationType === "manufacturer" ? (
        <SearchableSelect
          label="Manufacturer"
          value={destinationId || undefined}
          selectedLabel={manufacturers.find((m) => m.id === destinationId)?.name}
          options={manufacturers.map((m) => ({ value: m.id, label: m.name }))}
          onSelect={setDestinationId}
          onSearch={setManufacturerTerm}
          loading={manufacturersLoading}
          placeholder="Choose a manufacturer"
          searchPlaceholder="Search manufacturers"
          emptyMessage="No manufacturers match."
          error={errors.destinationId}
        />
      ) : null}

      {section("Schedule")}
      <Input
        label="Starts on"
        value={startsAt}
        onChangeText={setStartsAt}
        error={errors.startsAt}
        placeholder="2026-10-05"
        hint="Leave empty to start as soon as it is on."
        keyboardType="numbers-and-punctuation"
      />
      <Input
        label="Ends on"
        value={endsAt}
        onChangeText={setEndsAt}
        error={errors.endsAt}
        placeholder="2026-10-31"
        hint="Leave empty to keep it running."
        keyboardType="numbers-and-punctuation"
      />
      <Input
        label="Display order"
        value={sortOrder}
        onChangeText={setSortOrder}
        error={errors.sortOrder}
        hint="0 shows first when there is more than one banner."
        keyboardType="number-pad"
      />

      <View style={[styles.switchRow, { borderTopColor: colors.borderSoft }]}>
        <View style={styles.switchText}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>Showing now</Text>
          <Text style={[styles.switchHint, { color: colors.textMuted }]}>
            Off keeps the banner and its wording, but nobody sees it
          </Text>
        </View>
        <Toggle
          value={isActive}
          onValueChange={setIsActive}
          accessibilityLabel="Showing now"
        />
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
        {formError ? (
          <Text style={[styles.formError, { color: colors.danger }]} accessibilityRole="alert">
            {formError}
          </Text>
        ) : null}

        <Button
          title={submitLabel}
          fullWidth
          loading={saving}
          disabled={imageUploading}
          onPress={() => void handleSubmit()}
        />
        {onDelete ? (
          <Button
            title="Delete banner"
            variant="danger"
            fullWidth
            loading={deleting}
            disabled={saving}
            onPress={() => setConfirmingDelete(true)}
          />
        ) : null}

        <ConfirmDialog
          visible={confirmingDelete}
          title="Delete this banner?"
          message={`${title.trim() || "This banner"} will be removed from the shop. This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Keep it"
          destructive
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
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
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  switchText: { flex: 1, gap: spacing.xxs },
  switchLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  switchHint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  formError: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
});
