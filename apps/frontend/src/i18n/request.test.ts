import { beforeEach, expect, it, vi } from "vitest";
import type { RequestConfig } from "next-intl/server";
import { locale } from "next/root-params";
import requestConfig from "./request";
import en from "../../messages/en.json";
import fa from "../../messages/fa.json";

vi.mock("next/root-params", () => ({ locale: vi.fn() }));
vi.mock("next-intl/server", () => ({ getRequestConfig: (factory: unknown) => factory }));

// Exercise the factory without constructing next-intl's legacy requestLocale getter.
const resolveConfig = requestConfig as (params: { locale?: string }) => Promise<RequestConfig>;
beforeEach(() => vi.resetAllMocks());

it.each(["fa", "en"])("reads %s from the root segment", async (value) => {
  vi.mocked(locale).mockResolvedValue(value);
  const result = await resolveConfig({});
  expect(result.locale).toBe(value);
  expect(result.messages).toEqual(value === "fa" ? fa : en);
});

it("honors an explicit locale without reading root params", async () => {
  vi.mocked(locale).mockRejectedValue(new Error("Not available in Route Handlers"));
  expect(await resolveConfig({ locale: "en" })).toMatchObject({ locale: "en", messages: en });
  expect(locale).not.toHaveBeenCalled();
});

it("preserves the Persian fallback for an invalid segment", async () => {
  vi.mocked(locale).mockResolvedValue("unknown");
  expect(await resolveConfig({})).toMatchObject({ locale: "fa", messages: fa });
});
