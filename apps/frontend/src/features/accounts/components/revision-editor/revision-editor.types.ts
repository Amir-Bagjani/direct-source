import type { BusinessOnboardingProps } from "../business-onboarding/business-onboarding.types";
import type { BusinessRevision } from "../../schemas/trust.schema";
import type { VerificationSection } from "../../schemas/onboarding.schema";
export interface RevisionEditorProps extends BusinessOnboardingProps {
  revision?: BusinessRevision;
  sections: VerificationSection[];
}
