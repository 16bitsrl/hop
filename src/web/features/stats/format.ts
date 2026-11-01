import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Bucket } from "./types";

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Number, date and name formatting in the interface language. */
export function useFormat() {
  const { i18n, t } = useTranslation("stats");
  const lang = i18n.language;
  return useMemo(() => {
    const number = new Intl.NumberFormat(lang);
    const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 });
    const regions = safe(() => new Intl.DisplayNames([lang], { type: "region" }));
    const languages = safe(() => new Intl.DisplayNames([lang], { type: "language" }));
    const utc = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang, { timeZone: "UTC", ...opts });
    const fmts = {
      dayShort: utc({ day: "numeric", month: "short" }),
      dayLong: utc({ weekday: "short", day: "numeric", month: "long", year: "numeric" }),
      monthShort: utc({ month: "short", year: "2-digit" }),
      monthLong: utc({ month: "long", year: "numeric" }),
      hourShort: utc({ hour: "2-digit", minute: "2-digit" }),
      hourLong: utc({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    };

    /** Parses a bucket key ("2026-06-10", "2026-06-10T14", "2026-06") as a wall clock date. */
    const keyDate = (key: string) => {
      const [y, m, rest = "01"] = key.split("-");
      const [d, h = "0"] = rest.split("T");
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h)));
    };

    return {
      number: (n: number) => number.format(n),
      percent: (ratio: number) => percent.format(ratio),
      bucket: (key: string, bucket: Bucket, long = false) => {
        const date = keyDate(key);
        if (bucket === "hour") return (long ? fmts.hourLong : fmts.hourShort).format(date);
        if (bucket === "month") return (long ? fmts.monthLong : fmts.monthShort).format(date);
        return (long ? fmts.dayLong : fmts.dayShort).format(date);
      },
      country: (code: string | null) => (code ? (safe(() => regions?.of(code.toUpperCase())) ?? code) : t("unknown")),
      language: (code: string | null) => (code ? (safe(() => languages?.of(code)) ?? code) : t("unknown")),
      date: (ms: number) => new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(ms),
    };
  }, [lang, t]);
}
