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
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
