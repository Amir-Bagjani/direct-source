import type { BusinessRevision } from "../../schemas/trust.schema";
export interface RevisionRecordProps {
  userId: string;
  revision: BusinessRevision;
  review?: boolean;
}
