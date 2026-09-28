export interface SafetyWorkProps {
  userId: string;
  owner: boolean;
  kind: "suspension" | "disposition";
}
