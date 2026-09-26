import { z } from "zod";
import { normalizeMobile } from "../utils/normalize-mobile";

export const loginSchema = z.object({
  mobile: z
    .string()
    .transform(normalizeMobile)
    .pipe(z.string().regex(/^\+989[0-9]{9}$/)),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.input<typeof loginSchema>;
