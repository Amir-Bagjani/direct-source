# Playwright End-to-End Testing

Use the existing `playwright.config.ts`: `tests/`, desktop Chromium and Pixel 7 projects,
two workers, trace on failure, and the dev server on port 3100. Local runs may use the
configured Chrome channel through `PLAYWRIGHT_CHANNEL=chrome`.

## What belongs here

Cover critical journeys and real-browser contracts: locale navigation, server-rendered
metadata, native dialog/focus/history, responsive overflow, authentication/session flows,
protected navigation, and later core ordering/catalog operations. Keep pure validation,
formatting, permission matrices, and API parsing in Vitest.

Use `getByRole` and `getByLabel` first, then stable visible text. Use a test id only when
there is no semantic locator. CSS locators are appropriate for document metadata and
root attributes that have no accessible role. Rely on Playwright assertions and auto
waiting; never add fixed sleeps.

## Isolation and fixtures

Each test must establish its own route and data/session state and run independently.
Keep assertions visible in the spec instead of hiding journeys inside a large page-object
layer. Extract a helper only after real duplication and keep it close to its journey.

When PRD-01 adds authentication, create storage state or API/session fixtures only after
the real cookie/BFF contract exists. Keep roles/accounts isolated, generate state outside
production, and never commit credentials, Django JWTs, cookies, or secrets. UI login gets
one focused journey; other authenticated tests may reuse a safe fixture.

## Locale and project matrix

Do not duplicate every journey for both locales and both devices. Run representative
critical journeys across the configured projects, then parameterize both `fa` and `en`
where language, direction, metadata, navigation, or translated content is the behavior.
Add targeted RTL/mobile cases when layout direction or viewport changes the risk.

Run `pnpm test:e2e` when routes, browser interactions, locale switching, native focus/
history, or an existing E2E assertion changes. A unit-only change does not require the
full browser suite locally; CI remains the full gate.

## Theme journeys

Theme tests isolate cookies per browser context. Verify the Light first-visit/invalid-value
fallback even with a dark OS preference, explicit keyboard selection, `aria-pressed`, persistence
through reload and locale navigation, and the returning Dark value at the first animation frame.
Use computed styles and contrast calculations for representative shared surfaces; screenshot
baselines remain deferred until the repository has a reviewed cross-platform baseline policy.
