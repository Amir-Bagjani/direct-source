import { inputClassName } from "../src/shared/ui/input/input";
import { test, expect, type Page } from "@playwright/test";

async function openPreferences(page: Page, locale: string) {
  if (page.viewportSize()!.width < 1024 && !(await page.getByRole("dialog").isVisible()))
    await page.getByRole("button", { name: locale === "fa" ? "منو" : "Menu", exact: true }).click();
}
async function closePreferences(page: Page) {
  if (page.viewportSize()!.width < 1024) await page.keyboard.press("Escape");
}
function contrastRatio(foreground: string, background: string) {
  const channels = (color: string) =>
    color
      .match(/[\d.]+/gu)!
      .slice(0, 3)
      .map(Number)
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
  const luminance = (color: string) => {
    const lab = /^lab\(([\d.]+) /.exec(color);
    if (lab) {
      const lightness = Number(lab[1]);
      return lightness > 8 ? ((lightness + 16) / 116) ** 3 : lightness / 903.3;
    }
    const neutral = /^oklch\(([\d.]+) 0 0\)$/.exec(color);
    if (neutral) return Number(neutral[1]) ** 3;
    const [red = 0, green = 0, blue = 0] = channels(color);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const locale of ["fa", "en"]) {
  test(`${locale}: global header search navigates to the localized catalog and preserves Back/Forward`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    const search = page.getByRole("search");
    await search.getByRole("searchbox").fill("کفش & leather");
    await search.getByRole("button").click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/${locale}/catalog` && url.searchParams.get("q") === "کفش & leather",
    );
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await page.goForward();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/${locale}/catalog` && url.searchParams.get("q") === "کفش & leather",
    );
  });
  test(`${locale}: direction, metadata, modal Back/Forward and responsive layout`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.set(window, "__fontLayoutShift", 0);
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (
            "value" in entry &&
            typeof entry.value === "number" &&
            "hadRecentInput" in entry &&
            !entry.hadRecentInput
          ) {
            Reflect.set(
              window,
              "__fontLayoutShift",
              Number(Reflect.get(window, "__fontLayoutShift")) + entry.value,
            );
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`/${locale}?keep=yes`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "fa" ? "rtl" : "ltr");
    await expect(page.locator("h1")).toHaveText(
      locale === "fa" ? "تأمین مستقیم، انتخاب مطمئن" : "Direct sourcing, confident choices",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `http://localhost:3000/${locale}`,
    );
    await expect(page.locator('link[hreflang="en"]')).toHaveAttribute(
      "href",
      "http://localhost:3000/en",
    );
    const opener = page.getByRole("button", {
      name: locale === "fa" ? "دربارهٔ بازارگاه" : "About the marketplace",
    });
    const foundation = await opener.evaluate(async (button, activeLocale) => {
      const rgb = (color: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const control = getComputedStyle(button);
      const heading = getComputedStyle(document.querySelector("h1")!);
      const navigation = getComputedStyle(document.querySelector("nav a")!);
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;inset:0 auto auto 0";
      const input = document.createElement("input");
      const table = document.createElement("table");
      const mixedText = document.createElement("span");
      mixedText.style.cssText = "font-size:32px;line-height:1.5";
      mixedText.textContent =
        activeLocale === "fa" ? "آزمایشِ حروفّ فارسی ۱۲۳ ABC 123" : "Inter English 123 فارسی ۱۲۳";
      probe.append(input, table, mixedText);
      document.body.append(probe);
      const inheritedFamilies = [input, table, mixedText].map(
        (element) => getComputedStyle(element).fontFamily,
      );
      const mixedStyle = getComputedStyle(mixedText);
      await document.fonts.load(
        `${mixedStyle.fontSize} ${mixedStyle.fontFamily}`,
        mixedText.textContent,
      );
      await document.fonts.ready;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      context.font = `${mixedStyle.fontWeight} ${mixedStyle.fontSize} ${mixedStyle.fontFamily}`;
      const metrics = context.measureText(mixedText.textContent);
      const glyphHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      const lineHeight = Number.parseFloat(mixedStyle.lineHeight);
      const fontUrls = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => /\.(?:woff2?|ttf|otf)(?:\?|$)/u.test(url));
      const primaryFamily = root.fontFamily.split(",")[0]!.trim();
      probe.remove();
      return {
        background: rgb(body.backgroundColor),
        buttonBackground: rgb(control.backgroundColor),
        buttonColor: rgb(control.color),
        buttonMinHeight: control.minHeight,
        buttonRadius: control.borderRadius,
        colorScheme: root.colorScheme,
        fontFamily: root.fontFamily,
        fontLoaded: document.fonts.check(`16px ${primaryFamily}`, mixedText.textContent),
        fontStatus: document.fonts.status,
        fontsAreSelfHosted: fontUrls.every((url) => new URL(url).origin === location.origin),
        fontUrls,
        glyphFitsLineBox: glyphHeight <= lineHeight,
        headingFontSize: heading.fontSize,
        headingLetterSpacing: heading.letterSpacing,
        headingWeight: heading.fontWeight,
        inheritedFamilies: [...inheritedFamilies, navigation.fontFamily],
        layoutShift: Number(Reflect.get(window, "__fontLayoutShift")),
      };
    }, locale);
    expect(foundation).toMatchObject({
      background: "rgb(255, 255, 255)",
      buttonBackground: "rgb(23, 23, 23)",
      buttonColor: "rgb(250, 250, 250)",
      buttonMinHeight: "44px",
      buttonRadius: "10px",
      colorScheme: "light",
    });
    expect(
      contrastRatio(foundation.buttonColor, foundation.buttonBackground),
    ).toBeGreaterThanOrEqual(4.5);
    expect(foundation.fontFamily).toContain(locale === "fa" ? "Vazirmatn" : "Inter");
    expect(foundation.fontLoaded).toBe(true);
    expect(foundation.fontStatus).toBe("loaded");
    expect(foundation.fontUrls.length).toBeGreaterThan(0);
    expect(foundation.fontsAreSelfHosted).toBe(true);
    expect(foundation.glyphFitsLineBox).toBe(true);
    if (locale === "fa") {
      expect(foundation.headingLetterSpacing).toBe("normal");
    } else {
      expect(Number.parseFloat(foundation.headingLetterSpacing)).toBeLessThan(0);
    }
    expect(foundation.headingWeight).toBe("600");
    expect(foundation.headingFontSize).toBe(page.viewportSize()!.width >= 640 ? "48px" : "30px");
    expect(foundation.inheritedFamilies.every((family) => family === foundation.fontFamily)).toBe(
      true,
    );
    expect(foundation.layoutShift).toBeLessThan(0.1);
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", {
      name: locale === "fa" ? "بستن" : "Close",
      exact: true,
    });
    await close.focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    expect(await dialog.evaluate((element) => getComputedStyle(element).fontFamily)).toBe(
      foundation.fontFamily,
    );
    expect(await dialog.evaluate((element) => getComputedStyle(element).overscrollBehavior)).toBe(
      "contain",
    );
    await page.goBack();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${locale}\\?keep=yes$`));
    await expect(opener).toBeFocused();
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    expect(await opener.evaluate((button) => getComputedStyle(button).boxShadow)).not.toBe("none");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

for (const locale of ["fa", "en"]) {
  test(`${locale}: Input remains readable and operable in both themes`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await page.evaluate((classes) => {
      const probe = document.createElement("div");
      probe.style.cssText = "max-inline-size:20rem;padding:16px";
      const label = document.createElement("label");
      label.htmlFor = "ui-kit-input-probe";
      label.textContent = "Input test";
      const field = document.createElement("div");
      const input = document.createElement("input");
      input.id = "ui-kit-input-probe";
      input.className = classes;
      input.setAttribute("aria-describedby", "ui-kit-input-error");
      field.append(input);
      const error = document.createElement("span");
      error.id = "ui-kit-input-error";
      error.textContent = "Invalid value";
      probe.append(label, field, error);
      document.body.append(probe);
    }, inputClassName);
    const input = page.getByRole("textbox", { name: "Input test" });
    const inspect = () =>
      input.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: (() => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
            ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            return `rgb(${r}, ${g}, ${b})`;
          })(),
          color: style.color,
          border: style.borderColor,
          height: element.getBoundingClientRect().height,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
        };
      });
    for (const theme of ["light", "dark"] as const) {
      if (theme === "dark") {
        await openPreferences(page, locale);
        await page.getByRole("button", { name: locale === "fa" ? "تیره" : "Dark" }).click();
        await closePreferences(page);
      }
      const normal = await inspect();
      expect(normal.height).toBeGreaterThanOrEqual(44);
      expect(normal.fontSize).toBe("16px");
      expect(normal.fontFamily).toContain(locale === "fa" ? "Vazirmatn" : "Inter");
      expect(contrastRatio(normal.color, normal.background)).toBeGreaterThanOrEqual(4.5);
      expect(normal.border).not.toBe("rgba(0, 0, 0, 0)");
      await input.focus();
      expect(await input.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
        "none",
      );
      await input.fill("sample");
      await expect(input).toHaveValue("sample");
      await input.evaluate((element) => element.setAttribute("aria-invalid", "true"));
      expect((await inspect()).border).not.toBe(normal.border);
      await input.evaluate((element) => {
        element.removeAttribute("aria-invalid");
        element.setAttribute("disabled", "");
      });
      await expect(input).toBeDisabled();
      await input.evaluate((element) => element.removeAttribute("disabled"));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const locale of ["fa", "en"]) {
  test(`${locale}: explicit themes persist without first-paint flash or navigation reset`, async ({
    page,
  }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration|hydrate|server rendered/iu.test(message.text())
      ) {
        hydrationErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => hydrationErrors.push(error.message));
    await page.goto(`/${locale}?keep=yes`);
    await openPreferences(page, locale);
    const darkLabel = locale === "fa" ? "تیره" : "Dark";
    const lightLabel = locale === "fa" ? "روشن" : "Light";
    const dark = page.getByRole("button", { name: darkLabel });
    const light = page.getByRole("button", { name: lightLabel });
    await expect(light).toHaveAttribute("aria-pressed", "true");
    await dark.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0a0a");
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`/${locale}\\?keep=yes$`));

    const readDarkStyles = () =>
      page.evaluate(() => {
        const rgb = (color: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return `rgb(${r}, ${g}, ${b})`;
        };
        const body = getComputedStyle(document.body);
        const primary = getComputedStyle(
          [...document.querySelectorAll("button")].find((button) =>
            button.textContent?.includes(
              document.documentElement.lang === "fa" ? "درباره" : "About",
            ),
          )!,
        );
        return {
          background: rgb(body.backgroundColor),
          color: rgb(body.color),
          buttonBackground: rgb(primary.backgroundColor),
          buttonColor: rgb(primary.color),
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
        };
      });
    expect(await readDarkStyles()).toMatchObject({
      background: "rgb(10, 10, 10)",
      buttonBackground: "rgb(229, 229, 229)",
      buttonColor: "rgb(23, 23, 23)",
      colorScheme: "dark",
    });
    const darkStyles = await readDarkStyles();
    expect(contrastRatio(darkStyles.color, darkStyles.background)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkStyles.buttonColor, darkStyles.buttonBackground),
    ).toBeGreaterThanOrEqual(4.5);

    await closePreferences(page);
    await page
      .getByRole("button", {
        name: locale === "fa" ? "دربارهٔ بازارگاه" : "About the marketplace",
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogStyles = await dialog.evaluate((element) => {
      const rgb = (color: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      const style = getComputedStyle(element);
      return { background: rgb(style.backgroundColor), color: rgb(style.color) };
    });
    expect(dialogStyles.background).toBe("rgb(23, 23, 23)");
    expect(contrastRatio(dialogStyles.color, dialogStyles.background)).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.addInitScript(() => {
      requestAnimationFrame(() => {
        Reflect.set(window, "__themeAtFirstFrame", document.documentElement.dataset.theme);
      });
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0a0a");
    expect(await page.evaluate(() => Reflect.get(window, "__themeAtFirstFrame"))).toBe("dark");

    await openPreferences(page, locale);
    await page.getByRole("link", { name: locale === "fa" ? "زبان" : "Language" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0a0a");
    await expect(page).toHaveURL(new RegExp(`/${locale === "fa" ? "en" : "fa"}\\?keep=yes`));

    await openPreferences(page, locale === "fa" ? "en" : "fa");
    const translatedLight = page.getByRole("button", {
      name: locale === "fa" ? "Light" : "روشن",
    });
    await translatedLight.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ffffff");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(hydrationErrors).toEqual([]);
  });
}

for (const preference of [undefined, "system"] as const) {
  test(`missing/invalid preference (${preference}) and dark operating-system preference still default to Light`, async ({
    context,
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    if (preference !== undefined)
      await context.addCookies([
        {
          name: "directsourcing-theme-v1",
          value: preference,
          url: "http://localhost:3100",
        },
      ]);
    await page.addInitScript(() => {
      requestAnimationFrame(() => {
        Reflect.set(window, "__themeAtFirstFrame", document.documentElement.dataset.theme);
      });
    });
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => Reflect.get(window, "__themeAtFirstFrame"))).toBe("light");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      "light",
    );
    await openPreferences(page, "en");
    expect(
      await page.getByRole("button", { name: "Dark" }).evaluate((button) =>
        getComputedStyle(button)
          .transitionDuration.split(",")
          .every((duration) => {
            const value = Number.parseFloat(duration);
            return duration.trim().endsWith("ms") ? value <= 0.01 : value * 1_000 <= 0.01;
          }),
      ),
    ).toBe(true);
  });
}

test("direct modal links close within the page and retain other parameters", async ({ page }) => {
  await page.goto("/en?keep=yes&modal=about");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/\/en\?keep=yes$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("locale switch preserves URL state; unknown routes return 404", async ({ page }) => {
  await page.goto("/fa?keep=yes");
  await openPreferences(page, "fa");
  await page.getByRole("link", { name: "زبان" }).click();
  await expect(page).toHaveURL(/\/en\?keep=yes/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const response = await page.goto("/en/missing");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found." })).toBeVisible();
});

test("root SEO endpoints exist and preview is not indexable", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain("/catalog");
});
