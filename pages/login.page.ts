import { Locator } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Login POM. Paste your app's real data-testid locators here - this is the
 * one file that talks to the actual login page.
 */
export class LoginPage extends BasePage {
  readonly emailInput: Locator = this.page.getByTestId("login-email-input");
  readonly passwordInput: Locator = this.page.getByTestId("login-password-input");
  readonly loginButton: Locator = this.page.getByTestId("login-submit-button");

  async open(baseUrl: string): Promise<void> {
    await this.page.goto(`${baseUrl}/login`);
  }

  async login(email: string, password: string): Promise<void> {
    // pressSequentially (real keystrokes) instead of fill() - the submit
    // button here only enables once it sees actual key events on the inputs.
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    // The page runs an invisible Cloudflare Turnstile challenge before
    // enabling submit; it can take longer than the default 30s action
    // timeout to resolve, so give the click extra time to wait it out.
    await this.loginButton.click({ timeout: 60_000 });
  }
}
