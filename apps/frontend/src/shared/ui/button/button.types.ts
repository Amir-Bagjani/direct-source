import type { ComponentPropsWithRef } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  loading?: boolean;
}
