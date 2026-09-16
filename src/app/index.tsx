import { Redirect } from "expo-router";
import LoadingState from "../components/common/LoadingState";
import { useAuth } from "../hooks/useAuth";

export default function AppIndex() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingState label="Loading Hibbullah" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (session.role === "admin") return <Redirect href="/(admin)" />;
  return <Redirect href="/(customer)/(tabs)" />;
}
