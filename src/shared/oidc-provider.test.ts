import { expect, test } from "vitest";
import { oidcButtonName, oidcProvider } from "./oidc-provider";

test("recognises the provider from its configuration address", () => {
  expect(oidcProvider("https://accounts.google.com/.well-known/openid-configuration")).toBe("google");
  expect(oidcProvider("https://login.microsoftonline.com/abc-123/v2.0/.well-known/openid-configuration")).toBe("microsoft");
  expect(oidcProvider("https://sso.example.com/realms/acme/.well-known/openid-configuration")).toBe("other");
  // Look-alike hosts are not trusted as a brand.
  expect(oidcProvider("https://accounts.google.com.evil.example/.well-known/openid-configuration")).toBe("other");
  expect(oidcProvider("not a url")).toBe("other");
});

test("names the provider on the sign-in button unless a name is given", () => {
  expect(oidcButtonName("", "https://accounts.google.com/.well-known/openid-configuration")).toBe("Google");
  expect(oidcButtonName("  ", "https://login.microsoftonline.com/abc/v2.0/.well-known/openid-configuration")).toBe("Microsoft");
  expect(oidcButtonName("", "https://sso.example.com/.well-known/openid-configuration")).toBe("SSO");
  expect(oidcButtonName(" Acme ", "https://accounts.google.com/.well-known/openid-configuration")).toBe("Acme");
});
