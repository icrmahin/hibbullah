import { useLocalSearchParams } from "expo-router";
import UnifiedAuth from "../../components/auth/UnifiedAuth";

export default function LoginRoute() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode = params.mode === "signup" ? "signup" : "signin";
  return <UnifiedAuth initialMode={initialMode} />;
}
