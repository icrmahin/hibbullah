import { useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import AdvertisementForm from "../../../components/admin/AdvertisementForm";
import { createAdvertisement } from "../../../services/advertisements";
import { uploadProductImage } from "../../../services/storage";

/** One level deep: the banner list, when there is nothing to pop. */
const onBack = () => goBack("/(admin)/advertisements");

export default function AdminAddAdvertisementScreen() {
  const router = useRouter();

  return (
    <Screen
      header={
        <ScreenHeader title="New banner" subtitle="Appears on the home screen" onBack={onBack} />
      }
    >
      {/* The form owns the banner's id, because the image has to be uploaded to
          `<id>` before the row exists. */}
      <AdvertisementForm
        onUploadImage={(localUri, advertisementId) =>
          uploadProductImage(localUri, advertisementId)
        }
        submitLabel="Add banner"
        onSubmit={async (input, advertisementId) => {
          await createAdvertisement(input, advertisementId);
          // Replace (not goBack) so the list screen remounts/focuses and its
          // focus-triggered reload picks up the new row immediately.
          router.replace("/(admin)/advertisements");
        }}
      />
    </Screen>
  );
}
