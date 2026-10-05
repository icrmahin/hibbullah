import { useLocalSearchParams, useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import LoadingState from "../../../components/common/LoadingState";
import AdvertisementForm from "../../../components/admin/AdvertisementForm";
import { useAdvertisement } from "../../../hooks/useAdvertisements";
import { deleteAdvertisement, updateAdvertisement } from "../../../services/advertisements";
import { uploadProductImage } from "../../../services/storage";

const onBack = () => goBack("/(admin)/advertisements");

export default function AdminEditAdvertisementScreen() {
  const params = useLocalSearchParams<{ adId: string }>();
  const adId = params.adId as string;
  const router = useRouter();
  const { advertisement, loading, error, reload } = useAdvertisement(adId);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Edit banner" subtitle="Update a home banner" onBack={onBack} />}>
        <LoadingState label="Loading banner" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Edit banner" subtitle="Update a home banner" onBack={onBack} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!advertisement) {
    return (
      <Screen header={<ScreenHeader title="Edit banner" subtitle="Update a home banner" onBack={onBack} />}>
        <EmptyState
          title="Banner not found"
          message="This banner may have been removed."
          actionLabel="Back to banners"
          onAction={() => goBack("/(admin)/advertisements")}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader title="Edit banner" subtitle="Update a home banner" onBack={onBack} />}>
      <AdvertisementForm
        key={advertisement.id}
        advertisement={advertisement}
        onUploadImage={(localUri, id) => uploadProductImage(localUri, id)}
        submitLabel="Save changes"
        onSubmit={async (input, id) => {
          await updateAdvertisement(id, input);
          goBack("/(admin)/advertisements");
        }}
        onDelete={async () => {
          await deleteAdvertisement(advertisement.id);
          // Replace, not back: the row this screen was showing no longer exists, and a
          // back gesture would land on a list that is about to reload without it anyway.
          router.replace("/(admin)/advertisements");
        }}
      />
    </Screen>
  );
}
