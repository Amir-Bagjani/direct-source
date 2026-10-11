import type { z } from "zod";
import type { businessSchema } from "../../schemas/business.schema";
import type { VerificationSection } from "../../schemas/onboarding.schema";
export interface BusinessWizardProps {
  userId: string;
  business: z.infer<typeof businessSchema>;
  sections: VerificationSection[];
  onCheck: () => void;
}
