import { Page } from "@playwright/test";

/** Base class every Page Object Model extends - holds the Playwright page handle. */
export class BasePage {
  constructor(protected readonly page: Page) {}
}
