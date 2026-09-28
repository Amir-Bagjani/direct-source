import type { VerificationSection } from "../../schemas/onboarding.schema";
export interface VerificationSectionProps {
  userId: string;
  businessId: string;
  section: VerificationSection;
  prepareRevision?: (data: Record<string, unknown>) => Promise<void>;
  editable: boolean;
}
