# Localization Testing

The application uses next-intl with `fa` (default, RTL) and `en` (LTR), locale-prefixed
routes, matching JSON catalogs, navigation helpers, and `next/root-params`.

## Layers

- `src/i18n/messages.test.ts` verifies identical leaf-key sets and usable non-empty
  string values in both catalogs. Extend this test when catalog-wide invariants change;
  do not build an ICU parser. Test parameterized/plural messages through next-intl when
  they are introduced.
- `src/i18n/request.test.ts` verifies explicit locale selection, root-segment selection,
  and the Persian fallback without deprecated requestLocale APIs.
- Component/integration tests verify translated labels, validation/error messages, and
  formatting where the component owns the behavior.
- Playwright verifies critical locale navigation, preservation of URL state, document
  `lang`/`dir`, localized content, metadata, and direction-sensitive layout.

Do not clone the whole suite per locale. Parameterize both locales when locale is the
contract; otherwise use one representative locale and add a targeted Persian/RTL case
for direction, wrapping, mixed-direction values, dates/numbers, or Persian-specific copy.

When adding messages, update both catalogs in the same change. Use next-intl itself for
ICU interpolation/plural behavior and locale formatting tests rather than a custom parser.
Dates require explicit timezone/calendar expectations: API UTC, Persian Jalali/Tehran,
and English Gregorian according to the project architecture.
