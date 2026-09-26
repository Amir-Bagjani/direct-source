"use client";

import { bffRequest } from "@/shared/api/browser-client";
import { registrationResultSchema, registrationSchema } from "../schemas/registration.schema";
import type { RegistrationInput } from "../schemas/registration.schema";

export async function submitRegistration(input: RegistrationInput) {
  return bffRequest("/api/bff/auth/register", registrationResultSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registrationSchema.parse(input)),
  });
}
