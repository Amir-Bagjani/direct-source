export interface ChallengeFormProps {
  purpose: "verify" | "reset";
  readToken: () => string;
  onComplete: () => void;
}
