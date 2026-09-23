# Testing and Documentation

Follow `testing-architecture` and select the lowest level that proves each distinct risk.

- Component tests cover public variants, native prop/ref forwarding, accessible names,
  disabled/loading behavior, callbacks, and owned utilities.
- Pure tests may verify token-source consistency or a transformation when CSS parsing is
  necessary; avoid duplicating the browser's cascade in a test.
- Playwright covers computed token/application behavior, direction, responsive overflow,
  keyboard focus, native dialog/history, and representative Persian/English journeys.
- Theme coverage includes the Light first-visit and failure default, explicit Dark/Light choices,
  versioned persistence, first-paint initialization, client navigation, reduced motion, computed
  contrast and the shared component surfaces that actually exist.
- A visual inspection or screenshot comparison uses deterministic fonts, viewport,
  animations, data, and browser versions. Do not accept changed baselines automatically.

Playwright screenshot assertions are supported but currently deferred: CI uses its
managed Chromium while local verification may use the system Chrome channel, and no
reviewed baseline/storage policy exists. Establish platform-stable CI baselines before
adding `toHaveScreenshot`; retain semantic and computed-style assertions meanwhile.

Storybook is not currently installed. Component files and tests are the executable API
documentation, and this Skill records design contracts. Add Storybook only when the
shared library has enough real variants to justify another build surface. Use the official
`@storybook/nextjs-vite` integration, colocate meaningful stories, import global tokens,
and document purpose, variants, states, accessibility, RTL/LTR, localization, and theme.
Do not add placeholder stories.

When Storybook or visual baselines are introduced, add their build/test commands to CI,
pin versions, exclude generated output, and update `testing-architecture` with ownership
and failure-triage rules.
