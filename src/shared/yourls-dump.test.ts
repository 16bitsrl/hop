import { describe, expect, it } from "vitest";
import { mysqlDateToMs, parseValueTuples, YourlsDumpParser, type YourlsLogRow, type YourlsUrlRow } from "./yourls-dump";

const tuples = (sql: string) => {
  const rows: unknown[][] = [];
  parseValueTuples(sql, 0, (r) => rows.push(r));
  return rows;
};

describe("parseValueTuples", () => {
  it("reads strings, numbers and NULL", () => {
    expect(tuples("(1,'abc',NULL,-2.5,null);")).toEqual([[1, "abc", null, -2.5, null]]);
  });
  it("handles MySQL escapes", () => {
    expect(tuples(String.raw`('it\'s','a\\b','l1\nl2','tab\t','q\"q','nul\0x','\%\_')`)).toEqual([
      ["it's", "a\\b", "l1\nl2", "tab\t", 'q"q', "nul\0x", "\\%\\_"],
    ]);
  });
  it("handles doubled quotes", () => {
    expect(tuples("('it''s','''','a''''b')")).toEqual([["it's", "'", "a''b"]]);
  });
  it("keeps commas, parentheses and semicolons inside strings", () => {
    expect(tuples("('a,b','(x),(y)','end;','); DROP')")).toEqual([["a,b", "(x),(y)", "end;", "); DROP"]]);
  });
  it("reads UTF-8 and emoji", () => {
    expect(tuples("('città ☕ 🚀','日本語')")).toEqual([["città ☕ 🚀", "日本語"]]);
  });
  it("reads extended inserts with many rows", () => {
    expect(tuples("(1,'a'),(2,'b'),\n(3,'c');")).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
  });
  it("reads a backslash right before the closing quote", () => {
    expect(tuples(String.raw`('C:\\','x')`)).toEqual([["C:\\", "x"]]);
  });
  it("skips charset introducers", () => {
    expect(tuples("(_binary 'abc',_utf8mb4 'd',5)")).toEqual([["abc", "d", 5]]);
  });
});

const DUMP = `-- MySQL dump 10.13
/*!40101 SET NAMES utf8mb4 */;
DROP TABLE IF EXISTS \`yourls_log\`;
CREATE TABLE \`yourls_log\` (
  \`click_id\` int(11) NOT NULL AUTO_INCREMENT,
  \`click_time\` datetime NOT NULL,
  \`shorturl\` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  \`referrer\` varchar(200) NOT NULL,
  \`user_agent\` varchar(255) NOT NULL,
  \`ip_address\` varchar(41) NOT NULL,
  \`country_code\` char(2) NOT NULL,
  PRIMARY KEY (\`click_id\`)
) ENGINE=InnoDB;
CREATE TABLE \`yourls_url\` (
  \`keyword\` varchar(200) NOT NULL,
  \`url\` text NOT NULL,
  \`title\` text,
  \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`ip\` varchar(41) NOT NULL,
  \`clicks\` int(10) unsigned NOT NULL,
  PRIMARY KEY (\`keyword\`)
) ENGINE=InnoDB;
CREATE TABLE \`yourls_options\` (
  \`option_id\` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  \`option_name\` varchar(64) NOT NULL
);
INSERT INTO \`yourls_options\` VALUES (1,'version');
INSERT INTO \`yourls_url\` VALUES ('home','https://example.com/it\\'s','Titolo, con (parentesi)','2021-03-04 05:06:07','10.0.0.1',12),('x-y','https://example.com/?a=1&b=2',NULL,'2022-01-01 00:00:00','10.0.0.2',0);
INSERT INTO \`yourls_log\` VALUES (1,'2021-03-04 06:00:00','home','https://t.co/','Mozilla/5.0 (X11; Linux)','1.2.3.4','IT'),(2,'2021-03-05 06:00:00','x-y','','','5.6.7.8','');
`;

function parse(text: string, chunk = 0) {
  const urls: YourlsUrlRow[] = [];
  const logs: YourlsLogRow[] = [];
  const p = new YourlsDumpParser({ onUrl: (r) => urls.push(r), onLog: (r) => logs.push(r) });
  if (!chunk) p.push(text);
  else for (let i = 0; i < text.length; i += chunk) p.push(text.slice(i, i + chunk));
  p.end();
  return { p, urls, logs };
}

describe("YourlsDumpParser", () => {
  it("reads links and clicks and detects the prefix", () => {
    const { p, urls, logs } = parse(DUMP);
    expect(p.prefix).toBe("yourls_");
    expect(urls).toEqual([
      { keyword: "home", url: "https://example.com/it's", title: "Titolo, con (parentesi)", timestamp: "2021-03-04 05:06:07", ip: "10.0.0.1", clicks: 12 },
      { keyword: "x-y", url: "https://example.com/?a=1&b=2", title: null, timestamp: "2022-01-01 00:00:00", ip: "10.0.0.2", clicks: 0 },
    ]);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      clickId: 1,
      clickTime: "2021-03-04 06:00:00",
      shortUrl: "home",
      referrer: "https://t.co/",
      userAgent: "Mozilla/5.0 (X11; Linux)",
      ip: "1.2.3.4",
      country: "IT",
    });
  });
  it("gives the same result however the text is chunked", () => {
    const whole = parse(DUMP);
    for (const size of [1, 7, 64, 1000]) {
      const chunked = parse(DUMP, size);
      expect(chunked.urls).toEqual(whole.urls);
      expect(chunked.logs).toEqual(whole.logs);
    }
  });
  it("detects a custom prefix", () => {
    const { p, urls } = parse(DUMP.replaceAll("yourls_", "w_y_"));
    expect(p.prefix).toBe("w_y_");
    expect(urls).toHaveLength(2);
  });
  it("works without CREATE TABLE and with CRLF line ends", () => {
    const text = DUMP.split("\n")
      .filter((l) => l.startsWith("INSERT INTO `yourls_url`") || l.startsWith("INSERT INTO `yourls_log`"))
      .join("\r\n");
    const { p, urls, logs } = parse(text);
    expect(p.prefix).toBe("yourls_");
    expect(urls).toHaveLength(2);
    expect(logs).toHaveLength(2);
  });
  it("honours an explicit column list", () => {
    const { urls } = parse("INSERT INTO `yourls_url` (`clicks`,`keyword`,`url`) VALUES (3,'k','https://x.test');\n");
    expect(urls[0]).toMatchObject({ keyword: "k", url: "https://x.test", clicks: 3, title: null });
  });
  it("ignores other tables and a second prefix", () => {
    const { p, urls } = parse(DUMP + "INSERT INTO `other_url` VALUES ('zz','https://z.test',NULL,'2020-01-01 00:00:00','',1);\n");
    expect(urls).toHaveLength(2);
    expect(p.ignoredTables).toEqual(["other_url"]);
  });
  it("keeps rows when the final newline is missing", () => {
    const { urls } = parse("INSERT INTO `yourls_url` VALUES ('a','https://a.test',NULL,'2020-01-01 00:00:00','',1);");
    expect(urls).toHaveLength(1);
  });
});

describe("mysqlDateToMs", () => {
  it("reads UTC by default", () => {
    expect(mysqlDateToMs("2021-03-04 05:06:07")).toBe(Date.UTC(2021, 2, 4, 5, 6, 7));
  });
  it("reads a time zone with daylight saving", () => {
    expect(mysqlDateToMs("2021-01-15 12:00:00", "Europe/Rome")).toBe(Date.UTC(2021, 0, 15, 11, 0, 0));
    expect(mysqlDateToMs("2021-07-15 12:00:00", "Europe/Rome")).toBe(Date.UTC(2021, 6, 15, 10, 0, 0));
  });
  it("rejects empty and zero dates", () => {
    expect(mysqlDateToMs("0000-00-00 00:00:00")).toBeNull();
    expect(mysqlDateToMs("")).toBeNull();
    expect(mysqlDateToMs(null)).toBeNull();
  });
});
