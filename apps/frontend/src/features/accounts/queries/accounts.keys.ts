import type { RecoveryAction } from "../schemas/recovery.schema";

export const accountKeys = {
  all: ["accounts"] as const,
  sessions: () => [...accountKeys.all, "session"] as const,
  session: (epoch: number) => [...accountKeys.sessions(), epoch] as const,
  register: () => [...accountKeys.all, "register"] as const,
  login: () => [...accountKeys.all, "login"] as const,
  logout: () => [...accountKeys.all, "logout"] as const,
  recovery: (action: RecoveryAction) => [...accountKeys.all, "recovery", action] as const,
};
