# API Contracts

## Sources and ownership

`docs/technical/api/openapi.yaml` is the API source of truth. `pnpm generate:api` produces
`src/shared/api/openapi.ts`; never edit that generated file. A feature API adapter derives
the operation request and response DTOs by indexed access into `paths`, `operations`, or
`components` and keeps those aliases beside the adapter.

Generated declarations describe compile-time wire shapes. They do not validate network
data. The browser adapter calls the same-origin client-marked `bffRequest`, supplies an
owning Zod schema for every successful response, and receives the schema-inferred type.
For a bodyless success, pass `z.undefined()`. Server adapters remain server-only and must
apply the same trust-boundary validation before returning data to application code.

```ts
const businessSchema = z.object({ id: z.string(), name: z.string() });
type BusinessResponseDTO = z.infer<typeof businessSchema>;

export function readBusiness(id: string, signal: AbortSignal) {
  return bffRequest(`/api/bff/businesses/${encodeURIComponent(id)}`, businessSchema, {
    signal,
  });
}
```

When a schema mirrors an OpenAPI DTO, use `satisfies z.ZodType<GeneratedDTO>` where it
improves drift detection without losing schema inference. Avoid forcing a schema into an
incorrect generated type with an assertion.

## DTOs, models, and forms

Keep a DTO as the transport representation when UI/domain code can use it safely as-is.
Create a mapping only when names, nullability, units, dates, permissions, discriminants,
or exposed fields differ. Money follows the backend contract's integer IRR representation;
do not silently convert it in a shared transport type.

Form inputs describe editable drafts and may differ from an API request. React Hook Form
uses the Zod resolver when a form schema owns runtime validation; derive the input with
`z.input` and the parsed value with `z.output` if coercion or transforms make them differ.
Map the parsed form value to a request DTO in the feature API/form boundary.

Keep `ApiError` as the sanitized shared failure contract. Raw backend messages and private
payloads do not enter UI state, logs, props, caches, or structured data. UI maps stable
error codes to localized messages.

## Contract changes

When the backend contract changes, update OpenAPI and backend tests, regenerate the file,
review the generated diff, update schemas/adapters/mappings, and run the focused frontend
tests. CI regenerates OpenAPI and rejects drift. Do not copy a generated DTO into a
handwritten global declaration to avoid dealing with a contract change.
