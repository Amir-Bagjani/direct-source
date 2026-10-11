export type AccountView =
  | "overview"
  | "profile"
  | "security"
  | "business"
  | "verification"
  | "documents"
  | "revisions"
  | "access"
  | "operations"
  | "trust"
  | "case";
export interface AccountScreenProps {
  view: AccountView;
  businessId?: string;
}
