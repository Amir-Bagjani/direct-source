import { z } from "zod";

const uuid = z.uuid();
const supplies = new Set(["ready", "production", "hybrid"]);
const methods = new Set(["free_mix", "fixed_pack"]);
const sorts = new Set(["relevance", "newest", "lead_time", "rating", "price_asc", "price_desc"]);

export interface CatalogFilters {
  q: string;
  categories: string[];
  manufacturers: string[];
  supply: string[];
  method: string[];
  orderable: "" | "true" | "false";
  leadMin: string;
  leadMax: string;
  priceMin: string;
  priceMax: string;
  ratingMin: string;
  attributes: Record<string, string[]>;
  sort: string;
  page: number;
}

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

function values(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ids(value: string | string[] | undefined) {
  return [...new Set(values(value).filter((entry) => uuid.safeParse(entry).success))].sort();
}

function selected(value: string | string[] | undefined, allowed: Set<string>) {
  return [...new Set(values(value).filter((entry) => allowed.has(entry)))].sort();
}

function unsigned(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\d{1,15}$/u.test(candidate) ? candidate : "";
}

function toman(value: string | string[] | undefined) {
  const candidate = unsigned(value);
  return candidate && BigInt(candidate) <= 100_000_000_000_000n ? candidate : "";
}

export function parseCatalogSearchParams(params: CatalogSearchParams): CatalogFilters {
  const rawPage = unsigned(params.page);
  const page = rawPage ? Number(rawPage) : 1;
  const rawOrderable = Array.isArray(params.orderable) ? params.orderable[0] : params.orderable;
  const rawSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const rawRating = Array.isArray(params.rating_min) ? params.rating_min[0] : params.rating_min;
  const attributes = Object.fromEntries(
    Object.entries(params)
      .filter(([key]) => key.startsWith("attr.") && uuid.safeParse(key.slice(5)).success)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key.slice(5), [...new Set(values(value))].sort()]),
  );
  return {
    q: rawQuery?.trim().slice(0, 200) ?? "",
    categories: ids(params.category),
    manufacturers: ids(params.manufacturer),
    supply: selected(params.supply, supplies),
    method: selected(params.method, methods),
    orderable: rawOrderable === "true" || rawOrderable === "false" ? rawOrderable : "",
    leadMin: unsigned(params.lead_min),
    leadMax: unsigned(params.lead_max),
    priceMin: toman(params.price_min),
    priceMax: toman(params.price_max),
    ratingMin:
      rawRating && /^(?:[0-4](?:\.\d{1,2})?|5(?:\.0{1,2})?)$/u.test(rawRating)
        ? String(Number(rawRating))
        : "",
    attributes,
    sort: rawSort && sorts.has(rawSort) ? rawSort : "",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function catalogSearch(filters: CatalogFilters) {
  const search = new URLSearchParams();
  if (filters.q) search.set("q", filters.q);
  for (const value of filters.categories) search.append("category", value);
  for (const value of filters.manufacturers) search.append("manufacturer", value);
  for (const value of filters.supply) search.append("supply", value);
  for (const value of filters.method) search.append("method", value);
  if (filters.orderable) search.set("orderable", filters.orderable);
  if (filters.leadMin) search.set("lead_min", filters.leadMin);
  if (filters.leadMax) search.set("lead_max", filters.leadMax);
  if (filters.priceMin) search.set("price_min", filters.priceMin);
  if (filters.priceMax) search.set("price_max", filters.priceMax);
  if (filters.ratingMin) search.set("rating_min", filters.ratingMin);
  for (const [id, values] of Object.entries(filters.attributes))
    for (const value of values) search.append(`attr.${id}`, value);
  if (filters.sort) search.set("sort", filters.sort);
  if (filters.page > 1) search.set("page", String(filters.page));
  return search;
}

export function publicCatalogFilters(filters: CatalogFilters): CatalogFilters {
  return {
    ...filters,
    priceMin: "",
    priceMax: "",
    sort: filters.sort.startsWith("price_") ? "" : filters.sort,
  };
}

export function publicCatalogSearch(filters: CatalogFilters) {
  return catalogSearch(publicCatalogFilters(filters));
}

export function wholesaleCatalogSearch(filters: CatalogFilters) {
  const search = catalogSearch(filters);
  for (const key of ["price_min", "price_max"] as const) {
    const value = search.get(key);
    if (value) search.set(key, String(BigInt(value) * 10n));
  }
  return search;
}

export function catalogPageHref(filters: CatalogFilters, page: number) {
  const search = catalogSearch({ ...filters, page });
  const query = search.toString();
  return `/catalog${query ? `?${query}` : ""}`;
}
