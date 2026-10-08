import { beforeEach, expect, it, vi } from "vitest";
import { catalogManagementBff } from "./catalog-management.server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  response: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/server/auth/config", () => ({
  authConfig: () => ({ origin: "https://market.example" }),
}));
vi.mock("@/server/django-request", () => ({ djangoResponse: mocks.response }));
vi.mock("@/features/accounts/contracts/catalog-session.server", () => ({
  withCatalogAccountRead: mocks.read,
  withCatalogAccountMutation: mocks.write,
  readCatalogWorkspaceAccess: mocks.access,
}));

const productId = "f81d4fae-7dec-41d0-a765-00a0c91e6bf6";
const businessId = "cb07c786-39a6-494b-a9c0-09eb9f52ce5c";
const categoryId = "50be79ea-a646-4cbb-b385-331f91252d9b";
const product = {
  id: productId,
  business: businessId,
  category: categoryId,
  name: "Shoe",
  description: "Wholesale shoe",
  brand: "Market",
  manufacturer_model: "M-1",
  attributes: {},
  images: ["a1b2aa4f-ddef-4871-93ea-660208848dea"],
  status: "draft",
  created_at: "2026-09-29T00:00:00Z",
  updated_at: "2026-09-29T00:00:00Z",
};

function request(action: string, body: unknown, origin = "https://market.example") {
  return new Request(`https://market.example/api/bff/catalog/studio/${action}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  const run = async (_request: Request, work: (token: string) => Promise<unknown>) =>
    work("server-token");
  mocks.read.mockImplementation(run);
  mocks.write.mockImplementation(run);
});

it("rejects unknown actions, foreign writes and wrong methods before upstream", async () => {
  expect((await catalogManagementBff(request("../../auth", {}), "../../auth")).status).toBe(400);
  expect(
    (
      await catalogManagementBff(
        request("product-save", {}, "https://evil.example"),
        "product-save",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await catalogManagementBff(
        new Request("https://market.example/api/bff/catalog/studio/product-save"),
        "product-save",
      )
    ).status,
  ).toBe(405);
  expect(mocks.response).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});

it("validates product drafts and forwards only the fixed owner fields", async () => {
  mocks.response.mockResolvedValue(Response.json(product));
  const response = await catalogManagementBff(
    request("product-save", {
      business: businessId,
      category: categoryId,
      name: "Shoe",
      description: "Wholesale shoe",
      brand: "Market",
      manufacturer_model: "M-1",
      attributes: {},
      images: product.images,
      status: "published",
      assigned_to: "forged",
    }),
    "product-save",
  );
  expect(response.status).toBe(200);
  expect(mocks.response).toHaveBeenCalledWith("/api/v1/catalog/products/", {
    method: "POST",
    access: "server-token",
    body: {
      business: businessId,
      category: categoryId,
      name: "Shoe",
      description: "Wholesale shoe",
      brand: "Market",
      manufacturer_model: "M-1",
      attributes: {},
      images: product.images,
    },
  });
});

it("rejects invalid pricing before opening the mutation boundary", async () => {
  const response = await catalogManagementBff(
    request("sales-save", { free_mix_min: 0, packs: [], tiers: [] }),
    "sales-save",
  );
  expect(response.status).toBe(400);
  expect(mocks.response).not.toHaveBeenCalled();
});

it("bounds image uploads and reconstructs product-image multipart data", async () => {
  mocks.response.mockResolvedValue(
    Response.json({
      id: product.images[0],
      purpose: "product_image",
      size: 5,
      content_type: "image/png",
      scan_status: "clean",
    }),
  );
  const form = new FormData();
  form.set("file", new File(["image"], "shoe.png", { type: "image/png" }));
  form.set("consent_version", "2026-09-07");
  form.set("purpose", "identity");
  const response = await catalogManagementBff(
    new Request(`https://market.example/api/bff/catalog/studio/upload?business=${businessId}`, {
      method: "POST",
      headers: { Origin: "https://market.example" },
      body: form,
    }),
    "upload",
  );
  expect(response.status).toBe(200);
  const sent = mocks.response.mock.calls[0]?.[1].form as FormData;
  expect([...sent.keys()]).toEqual(["file", "purpose", "consent_version"]);
  expect(sent.get("purpose")).toBe("product_image");
});
