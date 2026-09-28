import "server-only";
import { z } from "zod";
import { djangoRequest, djangoResponse } from "@/server/django-request";
import { authConfig } from "@/server/auth/config";
import { isSameOriginMutation } from "@/server/request-policy";
import { readJsonBody, readBodyBytes } from "@/server/read-body";
import { ApiError } from "@/shared/api/unwrap";
import { sessionId } from "./session-cookie.server";
import { withAccountRead, withAccountMutation } from "./session.server";
import { businessSchema, businessDraftSchema } from "../schemas/business.schema";
import {
  onboardingActionSchema,
  policySchema,
  queueSchema,
  sectionsSchema,
  sectionSchema,
  identitySchema,
  activitySchema,
  reviewSchema,
  reasonSchema,
  fileSchema,
} from "../schemas/onboarding.schema";

export async function onboardingBff(request: Request, actionName: string) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (status: number) =>
    Response.json(
      {
        code: "onboarding_unavailable",
        message: "onboarding_unavailable",
        request_id: crypto.randomUUID(),
      },
      { status, headers },
    );
  try {
    const action = onboardingActionSchema.parse(actionName);
    const read = ["policy", "queue", "detail", "sections", "content"].includes(action);
    const method = read
      ? "GET"
      : ["draft", "identity", "activity"].includes(action)
        ? "PUT"
        : "POST";
    if (request.method !== method) return fail(405);
    if (!isSameOriginMutation(request, authConfig().origin)) return fail(403);
    const sid = await sessionId(request.headers.get("cookie"));
    if (!sid) return fail(401);
    const url = new URL(request.url);
    if (action === "policy")
      return Response.json(
        await withAccountRead(sid, (access) =>
          djangoRequest("/api/v1/files/policy/", policySchema, { method: "GET", access }),
        ),
        { headers },
      );
    if (action === "queue") {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(url.searchParams.get("page") ?? 1);
      return Response.json(
        await withAccountRead(sid, (access) =>
          djangoRequest(`/api/v1/operations/verification-queue/?page=${page}`, queueSchema, {
            method: "GET",
            access,
          }),
        ),
        { headers },
      );
    }
    const id = z.uuid().parse(url.searchParams.get("id"));
    if (action === "content") {
      const response = await withAccountRead(sid, async (access) => {
        const result = await djangoResponse(`/api/v1/files/${id}/content/`, {
          method: "GET",
          access,
        });
        if (!result.ok) throw new ApiError(result.status, "file_unavailable");
        return result;
      });
      const type = response.headers.get("content-type") ?? "application/octet-stream";
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(type))
        return fail(502);
      return new Response(response.body, {
        headers: {
          ...headers,
          "Content-Type": type,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Content-Disposition": 'inline; filename="document"',
        },
      });
    }
    const base = `/api/v1/businesses/${id}` as const;
    if (action === "detail")
      return Response.json(
        await withAccountRead(sid, (access) =>
          djangoRequest(`${base}/`, businessSchema, { method: "GET", access }),
        ),
        { headers },
      );
    if (action === "sections")
      return Response.json(
        await withAccountRead(sid, (access) =>
          djangoRequest(`${base}/verification/`, sectionsSchema, { method: "GET", access }),
        ),
        { headers },
      );
    if (action === "upload") {
      const type = request.headers.get("content-type") ?? "";
      if (!type.startsWith("multipart/form-data;")) return fail(415);
      const bytes = await readBodyBytes(request, 11 * 1024 * 1024);
      const form = await new Response(bytes, { headers: { "Content-Type": type } }).formData();
      const file = form.get("file");
      if (
        !(file instanceof File) ||
        form.getAll("file").length !== 1 ||
        file.size > 10 * 1024 * 1024 ||
        file.size === 0
      )
        return fail(400);
      const purpose = z
        .enum(["identity", "activity", "business_logo", "suspension", "support"])
        .parse(form.get("purpose"));
      const consent = z.string().min(1).max(40).parse(form.get("consent_version"));
      const clean = new FormData();
      clean.set("file", file);
      if (purpose === "support") clean.set("ticket_id", id);
      else clean.set("purpose", purpose);
      clean.set("consent_version", consent);
      return Response.json(
        await withAccountMutation(sid, (access) =>
          djangoRequest(
            purpose === "support" ? "/api/v1/support/files/" : `${base}/files/`,
            fileSchema,
            { method: "POST", access, form: clean },
          ),
        ),
        { status: 201, headers },
      );
    }
    const body = ["submit", "claim"].includes(action)
      ? undefined
      : await readJsonBody(request, 16384);
    const parsed =
      action === "draft"
        ? businessDraftSchema.parse(body)
        : action === "identity"
          ? identitySchema.parse(body)
          : action === "activity"
            ? activitySchema.parse(body)
            : action === "review"
              ? reviewSchema.parse(body)
              : action === "reopen"
                ? reasonSchema.parse(body)
                : undefined;
    await withAccountMutation(sid, async (access) => {
      if (action === "draft")
        await djangoRequest(`${base}/draft/`, businessSchema, {
          method: "PUT",
          access,
          body: parsed,
        });
      else if (action === "identity" || action === "activity")
        await djangoRequest(`${base}/verification/${action}/`, sectionSchema, {
          method: "PUT",
          access,
          body: parsed,
        });
      else
        await djangoRequest(`${base}/verification/${action}/`, businessSchema, {
          method: "POST",
          access,
          ...(parsed === undefined ? {} : { body: parsed }),
        });
    });
    return Response.json({ completed: true }, { headers });
  } catch (error) {
    return fail(error instanceof z.ZodError ? 400 : error instanceof ApiError ? error.status : 503);
  }
}
