import { Stack } from 'expo-router';

export default function CustomerProductsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="categories" />
      <Stack.Screen name="category/[categoryId]" />
      <Stack.Screen name="[productId]" />
    </Stack>
  );
}
