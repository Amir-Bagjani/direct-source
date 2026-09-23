import { test, expect } from "@playwright/test";

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
    const [red = 0, green = 0, blue = 0] = channels(color);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const locale of ["fa", "en"]) {
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
    const foundation = await opener.evaluate((button, activeLocale) => {
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
        background: body.backgroundColor,
        buttonBackground: control.backgroundColor,
        buttonColor: control.color,
        buttonMinHeight: control.minHeight,
        buttonRadius: control.borderRadius,
        colorScheme: root.colorScheme,
        colorVoid: root.getPropertyValue("--color-void").trim(),
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
      background: "rgb(247, 248, 250)",
      buttonBackground: "rgb(49, 78, 240)",
      buttonColor: "rgb(255, 255, 255)",
      buttonMinHeight: "44px",
      buttonRadius: "10px",
      colorScheme: "light",
      colorVoid: "#0b0c0e",
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
    expect(foundation.headingWeight).toBe("400");
    expect(foundation.headingFontSize).toBe(page.viewportSize()!.width >= 768 ? "64px" : "32px");
    expect(foundation.inheritedFamilies.every((family) => family === foundation.fontFamily)).toBe(
      true,
    );
    expect(foundation.layoutShift).toBeLessThan(0.1);
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
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
    expect(await opener.evaluate((button) => getComputedStyle(button).outlineWidth)).toBe("3px");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

for (const locale of ["fa", "en"]) {
  test(`${locale}: Input remains readable and operable in both themes`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "max-inline-size:20rem;padding:16px";
      const label = document.createElement("label");
      label.htmlFor = "ui-kit-input-probe";
      label.textContent = "Input test";
      const input = document.createElement("input");
      input.id = "ui-kit-input-probe";
      input.className = "ds-input";
      input.setAttribute("aria-describedby", "ui-kit-input-error");
      const error = document.createElement("span");
      error.id = "ui-kit-input-error";
      error.textContent = "Invalid value";
      probe.append(label, input, error);
      document.body.append(probe);
    });
    const input = page.getByRole("textbox", { name: "Input test" });
    const inspect = () =>
      input.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          color: style.color,
          border: style.borderColor,
          height: element.getBoundingClientRect().height,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
        };
      });
    for (const theme of ["light", "dark"] as const) {
      if (theme === "dark") {
        await page.getByRole("button", { name: locale === "fa" ? "تیره" : "Dark" }).click();
      }
      const normal = await inspect();
      expect(normal.height).toBeGreaterThanOrEqual(44);
      expect(normal.fontSize).toBe("16px");
      expect(normal.fontFamily).toContain(locale === "fa" ? "Vazirmatn" : "Inter");
      expect(contrastRatio(normal.color, normal.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(normal.border, normal.background)).toBeGreaterThanOrEqual(3);
      await input.focus();
      expect(await input.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("3px");
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

      const action = page.getByRole("button", {
        name: locale === "fa" ? "دربارهٔ بازارگاه" : "About the marketplace",
      });
      await action.evaluate((element) => {
        element.setAttribute("data-loading", "true");
        element.setAttribute("aria-busy", "true");
        element.setAttribute("disabled", "");
      });
      expect(
        await action.evaluate((element) => {
          const indicator = getComputedStyle(element, "::before");
          return indicator.content !== "none" && indicator.width === "16px";
        }),
      ).toBe(true);
      await expect(action).toBeDisabled();
      await action.evaluate((element) => {
        element.removeAttribute("data-loading");
        element.removeAttribute("aria-busy");
        element.removeAttribute("disabled");
      });
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
    const darkLabel = locale === "fa" ? "تیره" : "Dark";
    const lightLabel = locale === "fa" ? "روشن" : "Light";
    const dark = page.getByRole("button", { name: darkLabel });
    const light = page.getByRole("button", { name: lightLabel });
    await expect(light).toHaveAttribute("aria-pressed", "true");
    await dark.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#131416");
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`/${locale}\\?keep=yes$`));

    const readDarkStyles = () =>
      page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const primary = getComputedStyle(
          [...document.querySelectorAll("button")].find((button) =>
            button.textContent?.includes(
              document.documentElement.lang === "fa" ? "درباره" : "About",
            ),
          )!,
        );
        return {
          background: body.backgroundColor,
          color: body.color,
          buttonBackground: primary.backgroundColor,
          buttonColor: primary.color,
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
        };
      });
    expect(await readDarkStyles()).toMatchObject({
      background: "rgb(19, 20, 22)",
      buttonBackground: "rgb(242, 242, 242)",
      buttonColor: "rgb(51, 51, 51)",
      colorScheme: "dark",
    });
    const darkStyles = await readDarkStyles();
    expect(contrastRatio(darkStyles.color, darkStyles.background)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkStyles.buttonColor, darkStyles.buttonBackground),
    ).toBeGreaterThanOrEqual(4.5);

    await page
      .getByRole("button", {
        name: locale === "fa" ? "دربارهٔ بازارگاه" : "About the marketplace",
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogStyles = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(dialogStyles.background).toBe("rgb(41, 42, 45)");
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
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#131416");
    expect(await page.evaluate(() => Reflect.get(window, "__themeAtFirstFrame"))).toBe("dark");

    await page.getByRole("link", { name: locale === "fa" ? "زبان" : "Language" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#131416");
    await expect(page).toHaveURL(new RegExp(`/${locale === "fa" ? "en" : "fa"}\\?keep=yes`));

    const translatedLight = page.getByRole("button", {
      name: locale === "fa" ? "Light" : "روشن",
    });
    await translatedLight.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f7f8fa");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(hydrationErrors).toEqual([]);
  });
}

test("invalid preference and dark operating-system preference still default to Light", async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await context.addCookies([
    {
      name: "directsourcing-theme-v1",
      value: "system",
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

test("direct modal links close within the page and retain other parameters", async ({ page }) => {
  await page.goto("/en?keep=yes&modal=about");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/\/en\?keep=yes$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("locale switch preserves URL state; unknown routes return 404", async ({ page }) => {
  await page.goto("/fa?keep=yes");
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
