import type { z } from "zod";
import type { businessSchema } from "../../schemas/business.schema";
import type { BusinessRevision } from "../../schemas/trust.schema";
import type { VerificationSection } from "../../schemas/onboarding.schema";
export interface RevisionEditorProps {
  revision?: BusinessRevision;
  userId: string;
  business: z.infer<typeof businessSchema>;
  sections: VerificationSection[];
}
