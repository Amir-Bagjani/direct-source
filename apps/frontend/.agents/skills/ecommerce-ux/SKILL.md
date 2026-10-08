---
name: ecommerce-ux
description: Design or review wholesale marketplace journeys for catalog discovery, product selection, pricing, cart, ordering, and manufacturer workflows in DirectSourcing. Use for commerce interaction and information hierarchy decisions; PRDs and access contracts determine behavior.
---

# Ecommerce UX

Design for a managed wholesale marketplace connecting manufacturers and retailers.
The platform is not the reseller. Retail storefront conventions do not automatically
apply to business verification, wholesale quantities, or multi-manufacturer orders.

## Establish the journey

Read both project AGENTS.md files, `CONTEXT.md`, and the applicable PRD and
requirement/API contract. Paths below are relative to the repository root.

- Discovery and product selection: `docs/product/prd/02-catalog-pricing-supply.md`,
  `docs/product/requirements/catalog-browsing.md`, `pricing-rules.md`, and
  `docs/technical/api/catalog-browsing-lifecycle.md`.
- Cart and order placement: `docs/product/prd/04-cart-order.md`,
  `docs/product/requirements/cart-order-placement.md`, `order-lifecycle.md`, and
  the relevant `docs/technical/api/cart.md` or `orders.md`.
- Business onboarding and permissions: PRD-01, `business-onboarding.md`,
  `role-matrix.md`, and `docs/technical/frontend/web-sessions.md`.
- Manufacturer publication/revisions: PRD-02, `catalog-publication.md`, and the
  relevant catalog draft, revision, or sales API contract.

Identify the actor, business state, goal, entry route, and current implementation
gate in `docs/technical/frontend/implementation-plan.md`. Login, business
verification, platform roles, suspension, and controlled MVP access are separate
axes. Price visibility does not imply purchase permission. Describe the allowed
action and recovery path for each relevant state rather than guessing from login.

## Decisions to preserve

Use the current source documents to confirm these invariants before applying them:

- Public catalog information must not reveal wholesale amounts through copy,
  price filters/sorts, metadata, or client payloads. Provide the approved
  registration/verification action when price access is unavailable. Manufacturer
  and operations pricing workflows have their own authorized contracts.
- Preserve query, filters, sort, and page in the URL; use the specified 24-item
  pagination. Empty and error states keep the user's selection and offer explicit
  recovery. Do not silently broaden results or remove filters.
- Product cards support comparison of supply, sale method, minimum quantity,
  preparation time, manufacturer, and rating provenance. Keep purchase selection
  on the product page; quick add, popularity ranking, autocomplete, coupons, and
  negotiation are outside PRD-02's MVP scope.
- Explain fixed packs versus free mix, variants, minimum quantities, supply limits,
  and the applied quantity tier. Separate preparation time from transit time.
  Use representative list values and actual selected values in their proper places.
- Group the cart by manufacturer and product. Distinguish unit/line/goods totals,
  retailer fees, shipping, and the payable total. Cart values are current estimates;
  order snapshots are fixed. Retain invalid items for correction and require the
  specified reconfirmation after price changes. Do not silently change quantities.
- Preserve publication/revision decisions and audit history. Business verification
  and product approval are different states; a pending revision must not imply
  that approved public information has already changed.

## Produce and verify

Map the affected journey as actor/state → information → action → outcome/recovery.
Tie recommendations to the relevant requirement or acceptance criterion. Mark
new product ideas as proposals, not implemented permissions or approved scope.
Do not invent stock urgency, testimonials, ratings, discounts, or trust badges.

Read `../design-system/SKILL.md` for UI work and `../frontend-design/SKILL.md`
when shaping visual hierarchy. Use `docs/product/requirements/ui-language.md`
and ADR-0011/0012 for normal product language, IRR data/Toman display, and
Tehran/Jalali display. Keep Persian RTL and English LTR usable, including mixed
SKU/number content and long labels.

For implementation, apply the existing feature, TypeScript, data-fetching, and
testing rules. Verify meaningful permission and pricing behavior with targeted
tests; use `../visual-qa/SKILL.md` for rendered evidence. A UX review alone does
not authorize code changes or implementation of another PRD.

External research can inform proposals, but never override project contracts.
The [Baymard knowledge hub](https://baymard.com/blog) is supplementary research,
not the source or endorsement of this project-authored skill.
