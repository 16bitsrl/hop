export type Bucket = "hour" | "day" | "month";
export type Row = { key: string | null; clicks: number };
export type CityRow = { key: string; country: string | null; clicks: number };
export type TargetRow = { target: string; url: string | null; clicks: number; visitors: number };

export type Summary = {
  range: { from: number; to: number; tz: string; bucket: Bucket };
  totals: { clicks: number; visitors: number; bots?: number };
  series: { key: string; clicks: number }[];
  referrers: Row[];
  countries: Row[];
  cities?: CityRow[];
  devices: Row[];
  os: Row[];
  browsers: Row[];
  languages: Row[];
  link?: { id: string; slug: string; host: string; title: string | null } | null;
  targets?: TargetRow[];
};

export type Dashboard = Summary & {
  topLinks: { id: string; slug: string; title: string | null; host: string; clicks: number }[];
  recentLinks: { id: string; slug: string; title: string | null; host: string; createdAt: number; ownerName: string | null }[];
  linksByOwner: { ownerId: string | null; name: string | null; links: number }[];
  linkCount: number;
};
