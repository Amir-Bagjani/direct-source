# Naming Conventions

Preserve lowercase kebab-case filenames and descriptive PascalCase named types. Do not
prefix interfaces with `I` or aliases with `T`.

| Contract            | Pattern                                        | Example                          |
| ------------------- | ---------------------------------------------- | -------------------------------- |
| Domain entity/value | Domain noun                                    | `Business`, `OrderStatus`        |
| Component props     | Component + `Props`                            | `ModalProps`, `ProductCardProps` |
| API request body    | Operation + `RequestDTO`                       | `CreateOrderRequestDTO`          |
| API response body   | Operation/resource + `ResponseDTO`             | `BusinessResponseDTO`            |
| Form draft          | Purpose + `FormInput`                          | `RegistrationFormInput`          |
| UI projection       | Purpose + `ViewModel` when distinction matters | `ProductCardViewModel`           |
| Options             | Operation + `Options`                          | `PaginationOptions`              |
| Generic parameter   | Short only when obvious; descriptive otherwise | `T`, `TData`, `TError`           |
| Guard               | `is`/`has` + narrowed concept                  | `isApiError`, `hasLocale`        |

Use backend names only for wire DTOs. Domain and UI contracts use frontend/domain
vocabulary from `CONTEXT.md`. Keep generated OpenAPI names unchanged and do not hand-edit
`src/shared/api/openapi.ts` for style.

Do not append `Type`, `Interface`, `Data`, or `Object` when a precise domain word exists.
Use `DTO` only when the declaration actually represents transport data. Avoid `Model`
when the type is simply a response body or component props.

Name discriminants as stable domain concepts such as `status`, `kind`, or `type`, and use
literal members. Name callbacks for the event they report (`onClose`, `onSubmit`) and
commands for the action they perform (`closeModal`, `createOrder`).
