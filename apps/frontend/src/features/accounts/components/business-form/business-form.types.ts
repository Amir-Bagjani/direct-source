import type { z } from "zod";
import type { businessSchema } from "../../schemas/business.schema";
import type { BusinessDraft } from "../../schemas/business.schema";
export interface BusinessFormProps {
  userId: string;
  initialBusiness?: z.infer<typeof businessSchema>;
  prepareRevision?: (input: BusinessDraft) => Promise<void>;
  onSaved?: () => void;
  onCheck: () => void;
}
