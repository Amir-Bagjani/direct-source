import { ApiError } from "@/shared/api/unwrap";

export function hasFieldError(error: unknown, path: string): boolean {
  if (!(error instanceof ApiError) || error.status !== 400) return false;
  let value: unknown = error.fields;
  if (value && typeof value === "object" && Object.hasOwn(value, path)) return true;
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return false;
    value = Reflect.get(value, key);
  }
  if (value && typeof value === "object" && Object.hasOwn(value, "non_field_errors"))
    value = Reflect.get(value, "non_field_errors");
  return typeof value === "string" || (Array.isArray(value) && value.length > 0);
}
