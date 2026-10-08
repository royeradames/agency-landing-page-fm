import { expect, test, type Page } from "@playwright/test";

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

test("renders the supplied copy in landmarks with a single page heading", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Sunnyside agency landing page | Royer Adames");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We are creatives");
  await expect(page.locator("h1")).toHaveCount(1);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 2, name: "Transform your brand" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 2, name: "Stand out to the right audience" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 3 })).toHaveText(["Graphic Design", "Photography"]);
  await expect(main.getByRole("heading", { level: 2, name: "Client testimonials" })).toBeVisible();
  await expect(main.locator("blockquote")).toHaveCount(3);
  await expect(main.locator("figcaption .testimonial-name")).toHaveText(["Emily R.", "Thomas S.", "Jennie F."]);
  await expect(main.getByRole("region", { name: "Projects" }).getByRole("img")).toHaveCount(4);
  for (const image of await page.locator("main img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("alt", /\S/);
    await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
  }
  const learnMore = page.getByRole("link", { name: "Learn more" });
  await expect(learnMore).toHaveCount(2);
  await expect(learnMore.first()).toHaveAccessibleDescription("Transform your brand");
});

test("declares one site name in the footer, og:site_name and WebSite JSON-LD", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".site-name")).toHaveText("Sunnyside agency landing page");
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Sunnyside agency landing page");
  const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? "{}");
  expect(jsonLd).toEqual({ "@context": "https://schema.org", "@type": "WebSite", name: "Sunnyside agency landing page", url: "https://agency-landing-page-fm.royeradames.com" });
});

test("mobile menu opens by keyboard, closes with Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Menu" });
  const menu = page.locator("#site-menu");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("link")).toHaveText(["About", "Services", "Projects", "Contact"]);
  const panel = await box(page, "#site-menu");
  expect(Math.round(panel.x)).toBe(24);
  expect(Math.round(panel.width)).toBe(327);
  expect(Math.round(panel.y)).toBe(106);
  expect(Math.abs(panel.height - 305)).toBeLessThanOrEqual(1);
  const contactButton = (await menu.getByRole("link", { name: "Contact" }).boundingBox())!;
  expect([Math.round(contactButton.width), Math.round(contactButton.height)]).toEqual([160, 56]);
  expect(Math.abs(contactButton.y - 315)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link", { name: "About" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("mobile menu closes on an outside click and after choosing a link", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Menu" });
  const menu = page.locator("#site-menu");
  await toggle.click();
  await expect(menu).toBeVisible();
  expect(Math.round((await box(page, "#site-menu")).width)).toBe(688);
  await page.mouse.click(384, 700);
  await expect(menu).toBeHidden();
  await toggle.click();
  await menu.getByRole("link", { name: "Services" }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/#services$/);
});

test("desktop shows the inline navigation with hover states from the active design", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  const contact = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Contact" });
  await expect(contact).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const contactBox = (await contact.boundingBox())!;
  expect(Math.round(contactBox.width)).toBe(140);
  expect(Math.round(contactBox.height)).toBe(56);
  await contact.hover();
  await expect(contact).toHaveCSS("background-color", "rgba(255, 255, 255, 0.25)");
  const learnMore = page.getByRole("link", { name: "Learn more" }).first();
  const bar = () => learnMore.evaluate(element => getComputedStyle(element, "::after").opacity);
  expect(await bar()).toBe("0.25");
  await learnMore.hover();
  expect(await bar()).toBe("1");
  const footerLink = page.getByRole("contentinfo").getByRole("link", { name: "Services" });
  await footerLink.hover();
  await expect(footerLink).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("follows the Figma geometry at mobile, tablet and desktop", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  expect(Math.round((await box(page, ".hero")).height)).toBe(538);
  expect(Math.round((await box(page, ".feature-image img")).height)).toBe(312);
  expect(Math.round((await box(page, ".service")).height)).toBe(600);
  expect(Math.round((await box(page, ".gallery img")).width)).toBe(188);

  await page.setViewportSize({ width: 768, height: 1024 });
  expect(Math.round((await box(page, ".hero")).height)).toBe(800);
  expect(Math.round((await box(page, ".feature-image img")).height)).toBe(600);
  expect(Math.round((await box(page, ".testimonial")).width)).toBe(600);
  expect(Math.round((await box(page, ".gallery img")).width)).toBe(384);

  await page.setViewportSize({ width: 1440, height: 900 });
  expect(Math.round((await box(page, ".hero")).height)).toBe(800);
  const transformCopy = await box(page, "#about .feature-copy");
  const transformImage = await box(page, "#about .feature-image img");
  expect(transformImage.x).toBeGreaterThan(transformCopy.x);
  expect(Math.round(transformImage.width)).toBe(720);
  expect(Math.round(transformImage.height)).toBe(600);
  expect(Math.round(transformCopy.height)).toBe(600);
  const standImage = await box(page, "#stand-out .feature-image img");
  expect(Math.round(standImage.x)).toBe(0);
  expect(Math.round((await box(page, "#about h2")).x)).toBe(138);
  const services = await page.locator(".service").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  expect(services.map(service => Math.round(service.width))).toEqual([720, 720]);
  expect(Math.round(services[0].top)).toBe(Math.round(services[1].top));
  const cards = await page.locator(".testimonial").evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().width)));
  expect(cards).toEqual([350, 350, 350]);
  const tiles = await page.locator(".gallery img").evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  expect(tiles).toEqual([[360, 447], [360, 447], [360, 447], [360, 447]]);
});

test("fits narrow and enlarged layouts with the family text and target floors", async ({ page }) => {
  for (const width of [320, 375, 400, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Menu" });
    if (await toggle.isVisible()) await toggle.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const smallText = await page.locator("h1, h2, h3, p, a, figcaption span, footer").evaluateAll(elements =>
      elements.filter(element => element.getClientRects().length > 0 && parseFloat(getComputedStyle(element).fontSize) < 16).map(element => element.textContent));
    expect(smallText).toEqual([]);
    for (const control of await page.locator("a:visible, button:visible").all()) {
      const controlBox = await control.boundingBox();
      expect(controlBox?.height, await control.evaluate(element => element.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/* QA sweep October 8 (STS2, RS2): a negative margin pushed the Menu button 10 px past the header row from 320 to 1020. */
test("the Menu button stays inside the header row at every phone and tablet width", async ({ page }) => {
  for (const width of [320, 360, 400, 480, 600, 768, 900, 1020]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const spill = await page.evaluate(() => {
      const toggle = document.querySelector(".menu-toggle")!.getBoundingClientRect();
      const row = document.querySelector(".topbar")!.getBoundingClientRect();
      const nav = document.querySelector(".site-nav")!;
      return { past: Math.round(toggle.right - row.right), navScroll: nav.scrollWidth - nav.clientWidth };
    });
    expect(spill, `at ${width}`).toEqual({ past: 0, navScroll: 0 });
  }
  const toggle = page.getByRole("button", { name: "Menu" });
  const iconRight = await toggle.locator("svg").evaluate(icon => Math.round(icon.getBoundingClientRect().right));
  expect(iconRight, "icon keeps the design's right edge").toBe(Math.round((await box(page, ".topbar")).x + (await box(page, ".topbar")).width));
});

/* Width sweep October 8 (STS2): from 770 to 1020 "CREATIVES" was 17px wider than the 414px heading box. */
test("the hero heading fits its box at every width", async ({ page }) => {
  for (const width of [320, 375, 600, 768, 770, 900, 1020, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const spill = await page.locator(".hero h1").evaluate(heading => heading.scrollWidth - heading.clientWidth);
    expect(spill, `heading spill at ${width}`).toBeLessThanOrEqual(0);
  }
});

/* Journey QA October 8 (STS1): the open phone and tablet menu sat over the hero heading. As in the mobile-menu design, whatever
   the menu covers is hidden rather than left underneath it. */
test("the open menu never sits over visible hero text", async ({ page }) => {
  for (const width of [320, 375, 400, 600, 768, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator("#site-menu")).toBeVisible();
    const under = await page.evaluate(() => {
      const menu = document.querySelector("#site-menu")!.getBoundingClientRect();
      return [...document.querySelectorAll(".hero h1, .scroll-cue img")].filter(element => {
        const box = element.getBoundingClientRect();
        return element.checkVisibility({ visibilityProperty: true })
          && Math.min(box.right, menu.right) - Math.max(box.left, menu.left) > 2 && Math.min(box.bottom, menu.bottom) - Math.max(box.top, menu.top) > 2;
      }).map(element => element.textContent || element.localName);
    });
    expect(under, `hero content under the menu at ${width}`).toEqual([]);
  }
});
