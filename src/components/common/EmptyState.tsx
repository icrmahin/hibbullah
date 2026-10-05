import StateView from "./StateView";
import type { IconName } from "./Icon";

type EmptyStateProps = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Quiet glyph above the title. Pick something that names the absence, not decorates it. */
  icon?: IconName;
};

export default function EmptyState({ title, message, actionLabel, onAction, icon = "search-off" }: EmptyStateProps) {
  return (
    <StateView
      variant="empty"
      icon={icon}
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
