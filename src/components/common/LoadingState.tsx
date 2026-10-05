import StateView from "./StateView";

type LoadingStateProps = {
  label?: string;
};

export default function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  return <StateView variant="loading" label={label} />;
}
