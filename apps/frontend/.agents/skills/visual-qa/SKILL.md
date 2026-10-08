---
name: visual-qa
description: Verify rendered DirectSourcing UI with browser screenshots and observable checks after visible changes or on an explicit visual audit. Cover responsive layout, Persian RTL/English LTR, themes, overlays, focus, and relevant access states using existing Playwright tooling; source review alone is not visual signoff.
---

# Visual QA

Use this skill for rendered evidence. Keep the existing `web-design-guidelines`
skill for static guideline reviews and `testing-architecture` for test design.

## Scope and tools

Read the applicable PRD/contract, both AGENTS.md files,
[design-system](../design-system/SKILL.md), and
[testing architecture](../testing-architecture/SKILL.md), including its
[Playwright reference](../testing-architecture/references/playwright-e2e.md).
Inspect the actual Playwright configuration, package scripts, and relevant specs;
configuration and existing safe fixtures determine the current runtime setup.

Use an available browser tool or the project's installed Playwright against a
local/test environment. Do not require a new MCP server, browser framework,
account credential, SaaS service, or dependency. If no browser can run, report the
specific blocker and which checks remain unverified; source, lint, typecheck, and
build results cannot substantiate rendered visual claims. An audit does not imply
permission to repair code. Use safe existing test fixtures for protected states;
do not weaken guards or mutate production data to get screenshots.

## Coverage and evidence

Build a small matrix from the changed interface and its acceptance criteria:

- Both `fa` RTL and `en` LTR; representative desktop and mobile plus 320 CSS-pixel
  reflow where relevant. Use existing device projects when possible.
- Default Light, including a first visit with a dark OS preference; explicit Dark
  where the affected surface can differ. Include first paint/persistence when
  theme behavior changes, using the existing theme contract.
- Relevant initial, loading, populated, empty, error/retry, invalid, pending,
  disabled, and success states. Include real permission states when commerce or
  access-dependent content changes; do not manufacture unimplemented features.
- Keyboard focus and dialog/portal states; reduced motion and zoom when the
  affected interaction or layout warrants them.

For each observed state, record route, locale/direction, viewport, theme, test actor,
state setup, and screenshot path. Wait for observable readiness and loaded fonts
and images with browser assertions rather than fixed sleeps. Drive controls with
normal user input; DOM scripting may inspect geometry, but does not prove an
interaction works. Capture viewport screenshots for signoff and detail/full-page
images only when they help diagnose a problem. Open and inspect the actual images.
Keep screenshots, traces, and private fixture state out of commits and avoid
including credentials or personal data in evidence.

## Review the rendered result

- Compare information hierarchy, alignment, spacing, text wrapping, and image
  sizing with the approved brief and installed shadcn composition. Investigate
  discrepancies between screenshots and DOM bounds; measure target and ancestor
  rectangles/computed styles when diagnosing overflow or optical misalignment.
- Check clipped Persian glyphs, long translations, mixed-direction SKU/email/number
  content, logical layout, directional icons, and actual font rendering.
- Confirm visible focus, accessible labels, keyboard operation, touch targets,
  composed contrast, and that sticky UI does not obscure content. The canonical
  [accessibility reference](../design-system-architecture/references/accessibility.md)
  owns thresholds; screenshots cannot prove screen-reader behavior.
- Check overlays for viewport reflow, scroll, stacking, focus containment/return,
  Escape, and the existing [Modal URL/history contract](../design-system-architecture/references/modal-contract.md)
  when applicable.
- Check price/verification actions, totals, quantities, and recovery messages
  against the relevant commerce contract. A screenshot cannot prove price secrecy;
  use the existing security/contract tests for payload and metadata exposure.

When fixes are authorized, rerun the same failing state and focused browser check
after the change. Add regression coverage only for meaningful behavior or browser
risk through the existing testing workflow. Do not create screenshot baselines,
automatically accept diffs, or add visual CI infrastructure: reviewed cross-platform
baseline policy is currently deferred in the Playwright reference. No production
build is needed for ordinary visual QA.

## Report

Separate observed passes, failures, and unverified checks. For each defect include
severity, route/state/viewport, expected versus observed behavior, reproduction,
evidence path, and likely owning component when known. Report actual commands and
matrix coverage. Do not call an interface visually verified without inspecting
rendered screenshots; do not claim full accessibility compliance from visual QA.
