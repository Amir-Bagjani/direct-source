import type { Page } from "@playwright/test";
import type en from "../../messages/en.json";
export async function signOut(page: Page, copy: typeof en) {
  const button = page
    .getByRole("button", { name: copy.accounts.account.logout, exact: true })
    .first();
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole("button", { name: copy.accounts.workspace.accountMenu, exact: true })
      .click();
    await page.getByRole("menuitem", { name: copy.accounts.account.logout, exact: true }).click();
  }
}
