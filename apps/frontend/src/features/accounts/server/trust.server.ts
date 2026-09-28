import "server-only";
import { z } from "zod";
import { djangoRequest } from "@/server/django-request";
import { authConfig } from "@/server/auth/config";
import { readJsonBody } from "@/server/read-body";
import { isSameOriginMutation } from "@/server/request-policy";
import { ApiError } from "@/shared/api/unwrap";
import { sessionId } from "./session-cookie.server";
import { withAccountRead, withAccountMutation } from "./session.server";
import { businessSchema } from "../schemas/business.schema";
import { reasonSchema, reviewSchema } from "../schemas/onboarding.schema";
import {
  orderHistorySchema,
  ticketPageSchema,
  ticketSchema,
  ticketMessageSchema,
  ticketReplySchema,
  trustActionSchema,
  trustAccessSchema,
  directorySchema,
  revisionChangesSchema,
  revisionSchema,
  revisionPageSchema,
  revisionQueueSchema,
  workPageSchema,
  timelineSchema,
  suspensionPageSchema,
  suspensionInputSchema,
  commandSchema,
} from "../schemas/trust.schema";
export async function trustBff(request: Request, actionName: string) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (status: number) =>
    Response.json(
      { code: "trust_unavailable", message: "trust_unavailable", request_id: crypto.randomUUID() },
      { status, headers },
    );
  try {
    const action = trustActionSchema.parse(actionName);
    const read = [
      "revisions",
      "revision",
      "revision-queue",
      "access",
      "directory",
      "work",
      "timeline",
      "own-suspensions",
      "orders",
      "tickets",
      "ticket",
    ].includes(action);
    const method = read ? "GET" : action === "revision-update" ? "PUT" : "POST";
    if (request.method !== method) return fail(405);
    if (!isSameOriginMutation(request, authConfig().origin)) return fail(403);
    const sid = await sessionId(request.headers.get("cookie"));
    if (!sid) return fail(401);
    const url = new URL(request.url);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(url.searchParams.get("page") ?? 1);
    const id = [
      "access",
      "directory",
      "revision-queue",
      "work",
      "own-suspensions",
      "suspension-propose",
      "orders",
      "tickets",
    ].includes(action)
      ? ""
      : z.uuid().parse(url.searchParams.get("id"));
    const kind = z
      .enum(["suspension", "disposition"])
      .parse(url.searchParams.get("kind") ?? "suspension");
    if (read) {
      const result = await withAccountRead(sid, async (access) => {
        const options = { method: "GET", access } as const;
        switch (action) {
          case "orders":
            return djangoRequest(`/api/v1/orders/?page=${page}`, orderHistorySchema, options);
          case "tickets":
            return djangoRequest(
              `/api/v1/support/tickets/?page=${page}`,
              ticketPageSchema,
              options,
            );
          case "ticket":
            return djangoRequest(`/api/v1/support/tickets/${id}/`, ticketSchema, options);
          case "access":
            return djangoRequest("/api/v1/accounts/trust-access/", trustAccessSchema, options);
          case "directory":
            return djangoRequest(
              `/api/v1/accounts/directory/?page=${page}`,
              directorySchema,
              options,
            );
          case "own-suspensions":
            return djangoRequest(
              `/api/v1/accounts/suspensions/?page=${page}`,
              suspensionPageSchema,
              options,
            );
          case "revisions":
            return djangoRequest(
              `/api/v1/businesses/${id}/revisions/?page=${page}`,
              revisionPageSchema,
              options,
            );
          case "revision":
            return djangoRequest(`/api/v1/business-revisions/${id}/`, revisionSchema, options);
          case "revision-queue":
            return djangoRequest(
              `/api/v1/operations/business-revision-queue/?page=${page}`,
              revisionQueueSchema,
              options,
            );
          case "work":
            return djangoRequest(
              `/api/v1/operations/work/?kind=${kind}&page=${page}&include_closed=true`,
              workPageSchema,
              options,
            );
          case "timeline":
            return djangoRequest(
              `/api/v1/operations/work/${kind}/${id}/timeline/?page=${page}`,
              timelineSchema,
              options,
            );
          default:
            throw new Error("invalid_action");
        }
      });
      return Response.json(result, { headers });
    }
    const raw = action === "revision-claim" ? {} : await readJsonBody(request, 32768);
    const body =
      action === "ticket-reply"
        ? ticketReplySchema.parse(raw)
        : action === "revision-create" || action === "revision-update"
          ? revisionChangesSchema.parse(raw)
          : action === "revision-review"
            ? reviewSchema.parse(raw)
            : action === "controlled" || action === "operator"
              ? reasonSchema.extend({ enabled: z.boolean() }).parse(raw)
              : action === "suspension-propose"
                ? suspensionInputSchema.parse(raw)
                : action === "work-command"
                  ? commandSchema.parse(raw)
                  : action === "work-claim"
                    ? reasonSchema.parse(raw)
                    : {};
    await withAccountMutation(sid, async (access) => {
      const options = { method, access, body } as const;
      switch (action) {
        case "ticket-reply":
          await djangoRequest(
            `/api/v1/support/tickets/${id}/messages/`,
            ticketMessageSchema,
            options,
          );
          break;
        case "revision-create":
          await djangoRequest(`/api/v1/businesses/${id}/revisions/`, revisionSchema, options);
          break;
        case "revision-update":
          await djangoRequest(`/api/v1/business-revisions/${id}/`, revisionSchema, options);
          break;
        case "revision-claim":
          await djangoRequest(`/api/v1/business-revisions/${id}/claim/`, revisionSchema, options);
          break;
        case "revision-review":
          await djangoRequest(`/api/v1/business-revisions/${id}/review/`, revisionSchema, options);
          break;
        case "operator":
          await djangoRequest(`/api/v1/operations/operators/${id}/access/`, z.undefined(), options);
          break;
        case "controlled":
          await djangoRequest(
            `/api/v1/businesses/${id}/controlled-access/`,
            businessSchema,
            options,
          );
          break;
        case "suspension-propose":
          await djangoRequest(
            "/api/v1/operations/suspensions/",
            z.object({ data: z.object({ id: z.uuid(), status: z.literal("proposed") }) }),
            options,
          );
          break;
        case "work-claim":
          await djangoRequest(
            `/api/v1/operations/work/${kind}/${id}/claim/`,
            z.object({ data: z.object({ target: z.uuid() }) }),
            options,
          );
          break;
        case "work-command":
          await djangoRequest(
            `/api/v1/operations/work/${kind}/${id}/command/`,
            z.object({ data: z.object({ target: z.uuid(), status: z.string() }) }),
            options,
          );
          break;
        default:
          throw new Error("invalid_action");
      }
    });
    return Response.json({ completed: true }, { headers });
  } catch (error) {
    return fail(error instanceof z.ZodError ? 400 : error instanceof ApiError ? error.status : 503);
  }
}
