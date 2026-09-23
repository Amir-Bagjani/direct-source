import type { ButtonProps } from "./button.types";
import { cn } from "@/shared/ui/cn";

export function Button({
  className,
  disabled,
  loading = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const classes = cn("ds-button", `ds-button--${variant}`, className);
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={classes}
      data-loading={loading || undefined}
      data-slot="button"
      data-variant={variant}
      disabled={disabled || loading}
      type={type}
    />
  );
}
