import StateView from "./StateView";

export default function ErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <StateView
      variant="error"
      title={title}
      message={message}
      actionLabel={onRetry ? "Retry" : undefined}
      onAction={onRetry}
    />
  );
}
