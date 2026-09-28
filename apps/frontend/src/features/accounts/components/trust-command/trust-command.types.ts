export interface TrustCommandProps {
  userId: string;
  targetId: string;
  kind: "suspension" | "disposition";
  commands: string[];
}
