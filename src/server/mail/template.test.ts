import { expect, test } from "vitest";
import { actionMail, mailLanguage } from "./index";

const mail = () =>
  actionMail({
    lang: "en",
    appUrl: "https://hop.example.com",
    to: "a@example.com",
    subject: "Reset your password",
    intro: "Someone asked <to> reset & more.",
    button: "Choose a new password",
    url: "https://hop.example.com/reset?token=a&b=1",
  });

test("a mail carries the app's logo, name and colours", () => {
  const { html } = mail();
  expect(html).toContain('src="https://hop.example.com/icon-192.png"');
  expect(html).toContain(">hop<");
  expect(html).toContain("#0f7a5c");
});

test("the call to action is a button and the address is also written out", () => {
  const { html, text } = mail();
  expect(html).toContain('href="https://hop.example.com/reset?token=a&#38;b=1"');
  expect(html).toContain(">Choose a new password</a>");
  expect(text).toContain("Choose a new password: https://hop.example.com/reset?token=a&b=1");
});

test("text from people is escaped", () => {
  expect(mail().html).toContain("Someone asked &#60;to&#62; reset &#38; more.");
  expect(mail().html).not.toContain("<to>");
});

test("the footer says which site sent it", () => {
  expect(mail().html).toContain("hop.example.com");
  expect(mail().text).toContain("hop.example.com");
});

test("a mail goes out in the person's chosen language, else the browser's, else English", () => {
  expect(mailLanguage("it", "en-US,en;q=0.9")).toBe("it");
  expect(mailLanguage("en", "it-IT")).toBe("en");
  expect(mailLanguage(null, "it-IT,it;q=0.9,en;q=0.8")).toBe("it");
  expect(mailLanguage(undefined, "de-DE,it;q=0.5")).toBe("it");
  expect(mailLanguage(undefined, "de-DE,fr;q=0.5")).toBe("en");
  expect(mailLanguage(null, null)).toBe("en");
});

test("the frame of the mail follows its language", () => {
  const it = actionMail({ lang: "it", appUrl: "https://hop.example.com", to: "a@example.com", subject: "s", intro: "i", button: "b", url: "https://x.test/" });
  expect(it.html).toContain("Se il pulsante non funziona");
  expect(it.html).toContain("Inviata da hop da hop.example.com");
  expect(it.text).toContain("Inviata da hop da hop.example.com");
});
