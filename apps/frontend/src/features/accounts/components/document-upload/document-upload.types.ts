export interface DocumentUploadProps {
  targetId: string;
  purpose: "identity" | "activity" | "business_logo" | "suspension" | "support";
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
  max: number;
  disabled?: boolean;
}
