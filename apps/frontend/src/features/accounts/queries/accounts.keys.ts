import type { RecoveryAction } from "../schemas/recovery.schema";

export const accountKeys = {
  all: ["accounts"] as const,
  sessions: () => [...accountKeys.all, "session"] as const,
  session: (epoch: number) => [...accountKeys.sessions(), epoch] as const,
  business: (userId: string) => [...accountKeys.all, "business", userId] as const,
  onboarding: (userId: string) => [...accountKeys.all, "onboarding", userId] as const,
  sections: (userId: string, id: string) =>
    [...accountKeys.onboarding(userId), "sections", id] as const,
  businessDetail: (userId: string, id: string) =>
    [...accountKeys.onboarding(userId), "detail", id] as const,
  reviewQueue: (userId: string, page: number) =>
    [...accountKeys.onboarding(userId), "queue", page] as const,
  documentPolicy: () => [...accountKeys.all, "document-policy"] as const,
  trust: (userId: string, action: string, id: string, page: number, kind: string) =>
    [...accountKeys.onboarding(userId), "trust", action, id, page, kind] as const,
  onboardingMutation: () => [...accountKeys.all, "onboarding-mutation"] as const,
  createBusiness: () => [...accountKeys.all, "create-business"] as const,
  register: () => [...accountKeys.all, "register"] as const,
  login: () => [...accountKeys.all, "login"] as const,
  logout: () => [...accountKeys.all, "logout"] as const,
  recovery: (action: RecoveryAction) => [...accountKeys.all, "recovery", action] as const,
};
