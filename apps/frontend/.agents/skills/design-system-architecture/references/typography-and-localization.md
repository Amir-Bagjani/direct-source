# Typography and Localization

## Fonts

The approved typography foundation is **Vazirmatn for Persian (`fa`)** and **Inter for English
(`en`)**. Do not add an alternative primary family without an explicit architecture decision.

`src/app/[locale]/layout.tsx` loads the variable fonts with `next/font/google`, `display: "swap"`,
the `arabic` subset for Vazirmatn and the `latin` subset for Inter. Next.js downloads them at build
time and self-hosts the output. There are currently no reviewed local font assets to justify
`next/font/local`. If approved local Vazirmatn assets are added later, use one variable file where
possible and preserve the same CSS-variable contract. Never add a runtime Google Fonts import.

The document `lang` selects `--font-family-fa` or `--font-family-en` in CSS. Shared components,
native form controls, navigation, tables and dialog content inherit that choice; do not repeat
font-family declarations in each component. Keep Tahoma/Arial and the documented system sans
stack as load-failure fallbacks.

Keep body/control copy at a readable 14–16px and inputs at 16px. Headings use weight 400.
Use the documented scale through tokens and fluid `clamp()` for display text; do not force
desktop sizes onto mobile.

English headings may use the supplied negative tracking. Persian headings use normal
letter spacing and extra line-height for joined glyphs and diacritics. Do not uppercase,
italicize, or add letter spacing to Persian. Test Persian characters, Persian and Latin numerals,
diacritics and mixed Persian/English strings at the actual weights used in navigation, buttons,
forms, badges, errors, tables, modal content and long translations. Check glyph bounds at narrow
and wide viewports so line boxes do not clip marks above or below the text.

## Direction and content

The locale layout owns `<html lang>` and `dir`; CSS owns directional layout through
logical properties. Do not branch in JavaScript to swap inline start/end. Directional
icons and animations mirror deliberately; logos, media, checkmarks, play/pause, clocks,
and charts do not.

Wrap dynamic identifiers, emails, URLs, SKUs, and mixed user content with `<bdi>` or
`dir="auto"`; code and URLs stay `dir="ltr"`. Allow wrapping and avoid fixed text widths.
Use tabular numerals for aligned numeric columns when tables are implemented.

All visible strings belong in `messages/fa.json` and `messages/en.json`. Use next-intl
formatters for numbers, currency, dates, and relative time. API timestamps remain UTC;
Persian presentation uses the documented Jalali/Tehran rules. Do not create another
localization or translation-key system.
