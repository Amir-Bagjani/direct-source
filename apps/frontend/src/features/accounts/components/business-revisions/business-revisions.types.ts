import type { BusinessOnboardingProps } from "../business-onboarding/business-onboarding.types";
import type { VerificationSection } from "../../schemas/onboarding.schema";
export interface BusinessRevisionsProps extends BusinessOnboardingProps {
  sections: VerificationSection[];
}
