import Price from "./Price";

export default function ProductPrice({
  price,
  originalPrice,
}: {
  price: number;
  originalPrice?: number;
}) {
  return <Price price={price} originalPrice={originalPrice} size="card" />;
}
