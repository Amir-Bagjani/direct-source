# Registration policies

The project owner requested frontend pages and initial wording for terms and privacy
on 2026-09-24. The public pages are `/{locale}/terms` and `/{locale}/privacy`; the
canonical text is `accounts.policies` in both frontend locale catalogs. The form opens
each page in a new tab, explicitly announces that behavior and preserves its draft.
The checkbox starts unchecked. Client and BFF validation both require acceptance.

This is initial product wording, not legal advice or a certification of compliance.
Before a public launch, the operator's legal identity, a working privacy contact channel,
applicable jurisdiction and the retention policy require review. Do not invent contact
details, a legal entity, a deletion deadline, an unconditional deletion right or an
unimplemented support route. The current pages describe the actual review process.

## Product sources

- `CONTEXT.md`: person vs business, private records and domain vocabulary.
- `docs/product/requirements/business-onboarding.md`: required registration fields,
  one owner/business, optional email, private evidence and retention/deletion rules.
- `docs/product/requirements/payment-simulation.md`: no real funds or commercial
  commitments; invoices are not bank receipts, official or tax invoices. The page
  explains the actual restriction without introducing prohibited UI labels.
- `docs/product/requirements/account-suspension-flow.md`: restriction and open matters.
- `docs/technical/api/auth-and-trust.md` and `operations-analytics.md`: secure access,
  review, audit, consent versions and authorized deletion.

For readable structure, the privacy notice covers collection, purpose, visibility,
storage, retention, cookies and requests. The [ICO's notice guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/)
was consulted for disclosure topics only; this does not establish UK jurisdiction or
claim that the MVP's indefinite document retention complies with a particular law.

## Version ownership

Django already records `TERMS_VERSION = PRIVACY_VERSION = "2026-09-07"` and consent time.
These pages provide the initial frontend text for that existing identifier; the
identifier is not a claim that the pages were published on that date. No browser input
can choose the accepted version. Subsequent substantive text changes require a new
backend version, both translations, source-document updates and corresponding tests.
An authenticated re-acceptance flow is not implemented by this slice.

## Verification

Playwright covers both locale URLs, titles and canonical links; opening each policy
preserves the registration draft. Mobile/desktop checks include reflow, validation,
checkbox keyboard activation and theme inheritance. Real registration runs against
isolated Django/PostgreSQL; it does not prove web-session or logout behavior.
