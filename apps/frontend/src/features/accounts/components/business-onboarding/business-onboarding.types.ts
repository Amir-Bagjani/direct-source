import type { z } from "zod";
import type { businessSchema } from "../../schemas/business.schema";
export interface BusinessOnboardingProps {
  userId: string;
  business: z.infer<typeof businessSchema>;
}
