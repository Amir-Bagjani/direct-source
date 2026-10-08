import "server-only";
import { djangoRequest } from "@/server/django-request";
import { djangoResponse } from "@/server/django-request";
import { ApiError } from "@/shared/api/unwrap";
import { unwrap } from "@/shared/api/unwrap";
import { z } from "zod";
import { businessListSchema } from "../schemas/business.schema";
import { sessionId } from "../server/session-cookie.server";
import { withAccountRead } from "../server/session.server";
import { withAccountMutation } from "../server/session.server";

async function session(request: Request) {
  const id = await sessionId(request.headers.get("cookie"));
  if (!id) throw new ApiError(401, "session_required");
  return id;
}

async function retailerAccess(access: string) {
  const page = await djangoRequest("/api/v1/businesses/", businessListSchema, {
    method: "GET",
    access,
  });
  const business = page.results[0];
  return business?.kind === "retailer" && business.status === "verified" ? business.id : null;
}

export async function readCatalogPriceAccess(request: Request) {
  const id = await session(request);
  return withAccountRead(id, async (access) => {
    const scope = await retailerAccess(access);
    return scope ? { allowed: true as const, scope } : { allowed: false as const, scope: null };
  });
}

export async function withCatalogWholesaleRead<T>(
  request: Request,
  read: (access: string) => Promise<T>,
) {
  const id = await session(request);
  return withAccountRead(id, async (access) => {
    if (!(await retailerAccess(access))) throw new ApiError(403, "wholesale_required");
    return read(access);
  });
}

export async function withCatalogAccountRead<T>(
  request: Request,
  read: (access: string) => Promise<T>,
) {
  return withAccountRead(await session(request), read);
}

export async function withCatalogAccountMutation<T>(
  request: Request,
  mutate: (access: string) => Promise<T>,
) {
  return withAccountMutation(await session(request), mutate);
}

const catalogUserSchema = z.object({ id: z.uuid() });
const catalogTrustSchema = z.object({ owner: z.boolean() });
const catalogPolicySchema = z.object({ consent_version: z.string().min(1).max(40) });

export async function readCatalogWorkspaceAccess(request: Request) {
  return withAccountRead(await session(request), async (access) => {
    const [user, businesses, policy, trustResponse] = await Promise.all([
      djangoRequest("/api/v1/auth/me/", catalogUserSchema, { method: "GET", access }),
      djangoRequest("/api/v1/businesses/?page_size=2", businessListSchema, {
        method: "GET",
        access,
      }),
      djangoRequest("/api/v1/files/policy/", catalogPolicySchema, { method: "GET", access }),
      djangoResponse("/api/v1/accounts/trust-access/", { method: "GET", access }),
    ]);
    let operator = false;
    let owner = false;
    if (trustResponse.ok) {
      operator = true;
      owner = (await unwrap(trustResponse, catalogTrustSchema)).owner;
    } else if (trustResponse.status !== 403) {
      throw new ApiError(trustResponse.status, "catalog_access_unavailable");
    }
    return {
      scope: user.id,
      business: businesses.results[0] ?? null,
      operator,
      owner,
      consent_version: policy.consent_version,
    };
  });
}
