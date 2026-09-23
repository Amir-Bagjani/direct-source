import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/shared/ui/cn";
import type { InputProps } from "./input.types";

export function Input({ className, ...props }: InputProps) {
  const classes = cn("ds-input", className);
  return <InputPrimitive {...props} className={classes} data-slot="input" />;
}
