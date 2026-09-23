import { cn as mergeClasses } from "cn";

export function cn(...values: Parameters<typeof mergeClasses>) {
  return mergeClasses(...values);
}
