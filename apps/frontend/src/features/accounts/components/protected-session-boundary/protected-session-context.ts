"use client";
import { createContext, useContext } from "react";
import type { z } from "zod";
import type { registeredUserSchema } from "../../schemas/registration.schema";
interface ProtectedSession {
  user: z.infer<typeof registeredUserSchema>;
  authorized: boolean;
  logout: () => Promise<void>;
  loggingOut: boolean;
}
export const ProtectedSessionContext = createContext<ProtectedSession | null>(null);
export function useProtectedSession() {
  const value = useContext(ProtectedSessionContext);
  if (!value) throw new Error("ProtectedSessionBoundary is required");
  return value;
}
