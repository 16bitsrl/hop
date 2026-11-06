export type MailLanguage = "en" | "it";

/** The person's chosen language, else the first supported one their browser asks for, else English. */
export function mailLanguage(locale: string | null | undefined, acceptLanguage: string | null | undefined): MailLanguage {
  if (locale === "en" || locale === "it") return locale;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase();
    if (tag.startsWith("it")) return "it";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

export const mailMessages = {
  en: {
    fallback: "If the button does not work, copy this address into your browser:",
    sentBy: (app: string, host: string) => `Sent by ${app} at ${host}`,
    reset: {
      subject: "Reset your password",
      intro: "Someone asked to reset the password of your account. If it was you, choose a new password below. The link works for one hour.",
      button: "Choose a new password",
    },
    invite: {
      subject: (app: string) => `You have been invited to ${app}`,
      intro: (inviter: string, app: string, days: number) => `${inviter} invited you to join ${app}. The invitation works for ${days} days.`,
      button: "Accept the invitation",
    },
    test: {
      subject: (app: string) => `${app} test email`,
      text: (app: string) => `This is a test email from ${app}. Your email settings work.`,
    },
  },
  it: {
    fallback: "Se il pulsante non funziona, copia questo indirizzo nel browser:",
    sentBy: (app: string, host: string) => `Inviata da ${app} da ${host}`,
    reset: {
      subject: "Reimposta la password",
      intro: "È stato chiesto di reimpostare la password del tuo account. Se la richiesta è tua, scegline una nuova qui sotto. Il link vale per un'ora.",
      button: "Scegli una nuova password",
    },
    invite: {
      subject: (app: string) => `Ti hanno invitato su ${app}`,
      intro: (inviter: string, app: string, days: number) => `${inviter} ti ha invitato su ${app}. L'invito vale per ${days} giorni.`,
      button: "Accetta l'invito",
    },
    test: {
      subject: (app: string) => `Email di prova da ${app}`,
      text: (app: string) => `Questa è un'email di prova da ${app}. Le impostazioni email funzionano.`,
    },
  },
} satisfies Record<MailLanguage, unknown>;
