package cmd

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
	"github.com/16bitsrl/hop/cli/internal/ui"
)

// localZone is the time zone of this computer as the server wants it ("Europe/Rome").
func localZone() string {
	if tz := os.Getenv("TZ"); tz != "" && !strings.HasPrefix(tz, ":") {
		if _, err := time.LoadLocation(tz); err == nil {
			return tz
		}
	}
	if name := time.Local.String(); name != "Local" && name != "" {
		return name
	}
	if runtime.GOOS != "windows" {
		if target, err := filepath.EvalSymlinks("/etc/localtime"); err == nil {
			if _, zone, ok := strings.Cut(target, "zoneinfo/"); ok {
				if _, err := time.LoadLocation(zone); err == nil {
					return zone
				}
			}
		}
	}
	return "UTC"
}

// parsePeriod reads --period: 24h, 7d, 30d, 12m, or "all" (zero time: since the first click).
func parsePeriod(value string, now time.Time) (time.Time, error) {
	v := strings.ToLower(strings.TrimSpace(value))
	if v == "all" {
		return time.Time{}, nil
	}
	if len(v) >= 2 {
		if n, err := strconv.Atoi(v[:len(v)-1]); err == nil && n > 0 {
			switch v[len(v)-1] {
			case 'h':
				return now.Add(-time.Duration(n) * time.Hour), nil
			case 'd':
				return now.AddDate(0, 0, -n), nil
			case 'w':
				return now.AddDate(0, 0, -7*n), nil
			case 'm':
				return now.AddDate(0, -n, 0), nil
			case 'y':
				return now.AddDate(-n, 0, 0), nil
			}
		}
	}
	return time.Time{}, usageHint(t("“%s” is not a period.", value), t("Use 24h, 7d, 30d, 12m, 1y or all; or exact dates with --from and --to."))
}

func countLabel(c api.Count, unknown string) string {
	if c.Key == nil || *c.Key == "" {
		return unknown
	}
	if c.Country != nil && *c.Country != "" {
		return *c.Key + " (" + *c.Country + ")"
	}
	return *c.Key
}

func (a *app) statsCmd() *cobra.Command {
	var period, from, to, tz, csvKind, output string
	var bots bool
	cmd := &cobra.Command{
		Use:     "stats [link]",
		Aliases: []string{"dashboard"},
		Short:   t("Show clicks and where they come from"),
		Long: t("Show the statistics of a link, or of every link together when none is named: clicks over time, visitors, sources, countries, devices and more.") +
			"\n\n" + linkRefHelp(),
		Example: "hop stats\nhop stats spring --period 7d\nhop stats spring --from 2026-01-01 --to 2026-03-31\n" +
			"# " + t("One row per click, for a spreadsheet") + "\nhop stats spring --csv clicks -o clicks.csv",
		Args: maxArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			now := time.Now()
			q := api.Query{"tz": tz}
			if tz == "" {
				q["tz"] = localZone()
			}
			if bots {
				q["bots"] = "1"
			}
			if from != "" || to != "" {
				if from != "" {
					start, err := parseWhen(from, now)
					if err != nil || start == nil {
						return usage(t("“%s” is not a date.", from))
					}
					if len(strings.TrimSpace(from)) == len("2006-01-02") {
						*start = start.Add(-24*time.Hour + time.Second) // the start of that day
					}
					q["from"] = strconv.FormatInt(start.UnixMilli(), 10)
				}
				if to != "" {
					end, err := parseWhen(to, now)
					if err != nil || end == nil {
						return usage(t("“%s” is not a date.", to))
					}
					q["to"] = strconv.FormatInt(end.UnixMilli(), 10)
				}
			} else {
				start, err := parsePeriod(period, now)
				if err != nil {
					return err
				}
				if !start.IsZero() {
					q["from"] = strconv.FormatInt(start.UnixMilli(), 10)
				}
			}
			var link *api.Link
			if len(args) == 1 {
				if link, err = srv.findLink(ctx, args[0]); err != nil {
					return err
				}
				q["linkId"] = link.ID
			}

			if csvKind != "" {
				if csvKind != "clicks" && csvKind != "summary" {
					return usage(t("--csv takes “summary” (totals) or “clicks” (one row per click)."))
				}
				q["kind"] = csvKind
				data, _, err := srv.Raw(ctx, http.MethodGet, "/api/stats/export.csv", q, nil)
				if err != nil {
					return err
				}
				if output == "" || output == "-" {
					_, err := os.Stdout.Write(data)
					return err
				}
				if err := os.WriteFile(output, data, 0o644); err != nil {
					return fail(t("The file could not be written: %s", err.Error()))
				}
				ui.Success(t("Statistics saved to %s", output))
				return nil
			}

			path := "/api/stats/dashboard"
			if link != nil {
				path = "/api/stats/summary"
			}
			if a.jsonOut {
				var raw jsonRaw
				if err := srv.Get(ctx, path, q, &raw); err != nil {
					return err
				}
				return printJSON(raw)
			}
			var stats api.Stats
			if err := srv.Get(ctx, path, q, &stats); err != nil {
				return err
			}
			printStats(srv, link, &stats, bots)
			return nil
		},
	}
	f := cmd.Flags()
	f.StringVar(&period, "period", "30d", t("How far back: 24h, 7d, 30d, 12m, 1y or all"))
	f.StringVar(&from, "from", "", t("First day to count (2026-01-31), instead of --period"))
	f.StringVar(&to, "to", "", t("Last day to count (default: today)"))
	f.StringVar(&tz, "tz", "", t("Time zone for the days, like Europe/Rome (default: this computer's)"))
	f.BoolVar(&bots, "bots", false, t("Count link checkers, search engines and other bots too"))
	f.StringVar(&csvKind, "csv", "", t("Write a CSV file instead: “summary” or “clicks”"))
	f.StringVarP(&output, "output", "o", "", t("File for --csv (default: the standard output)"))
	return cmd
}

func printStats(srv *server, link *api.Link, s *api.Stats, bots bool) {
	width := ui.Width()
	if width == 0 || width > 100 {
		width = 100
	}
	ui.Println()
	what := t("All links on %s", srv.name)
	if link != nil {
		what = link.Host + "/" + link.Slug
	}
	loc := time.Local
	if l, err := time.LoadLocation(s.Range.Tz); err == nil {
		loc = l
	}
	span := time.UnixMilli(s.Range.From).In(loc).Format("2006-01-02") + " → " + time.UnixMilli(s.Range.To).In(loc).Format("2006-01-02")
	ui.Println("  " + ui.Accent.Bold(true).Render(what) + "  " + ui.Muted.Render(span))
	ui.Println()

	big := func(n int, label string) string {
		return lipgloss.NewStyle().Width(18).Render(ui.Bold.Render(ui.Number(n)) + "\n" + ui.Muted.Render(label))
	}
	tiles := []string{big(s.Totals.Clicks, t("clicks")), big(s.Totals.Visitors, t("visitors"))}
	botsLabel := t("bots, not counted")
	if bots {
		botsLabel = t("of which bots")
	}
	tiles = append(tiles, big(s.Totals.Bots, botsLabel))
	if link == nil {
		tiles = append(tiles, big(s.LinkCount, t("links")))
	}
	for _, line := range strings.Split(lipgloss.JoinHorizontal(lipgloss.Top, tiles...), "\n") {
		ui.Println("  " + line)
	}

	if len(s.Series) > 1 && s.Totals.Clicks > 0 {
		values := make([]int, len(s.Series))
		peak := 0
		for i, p := range s.Series {
			values[i] = p.Clicks
			peak = max(peak, p.Clicks)
		}
		ui.Println()
		chart := ui.Columns(values, width-6, 5)
		for _, line := range chart {
			ui.Println("  " + line)
		}
		first, last := s.Series[0].Key, s.Series[len(s.Series)-1].Key
		gap := max(1, lipgloss.Width(chart[0])-len(first)-len(last))
		ui.Println("  " + ui.Muted.Render(first+strings.Repeat(" ", gap)+last))
		ui.Println("  " + ui.Muted.Render(t("The tallest bar is %s clicks.", ui.Number(peak))))
	}
	if s.Totals.Clicks == 0 {
		ui.Println()
		ui.Println("  " + ui.Muted.Render(t("No clicks in this period.")))
		ui.Println()
		return
	}

	bars := func(counts []api.Count, unknown string) []ui.Bar {
		rows := make([]ui.Bar, 0, min(len(counts), 6))
		for _, c := range counts {
			if len(rows) == 6 {
				break
			}
			rows = append(rows, ui.Bar{Label: countLabel(c, unknown), Value: c.Clicks})
		}
		return rows
	}
	type section struct {
		title string
		rows  []ui.Bar
	}
	var sections []section
	if len(s.TopLinks) > 0 {
		rows := make([]ui.Bar, 0, len(s.TopLinks))
		for _, l := range s.TopLinks {
			rows = append(rows, ui.Bar{Label: l.Host + "/" + l.Slug, Value: l.Clicks})
		}
		sections = append(sections, section{t("Most clicked"), rows[:min(len(rows), 6)]})
	}
	if len(s.Targets) > 1 {
		rows := make([]ui.Bar, 0, len(s.Targets))
		for _, target := range s.Targets {
			label := deref(target.URL)
			if !target.Current {
				label += " " + t("(before)")
			}
			rows = append(rows, ui.Bar{Label: strings.TrimPrefix(label, "https://"), Value: target.Clicks})
		}
		sections = append(sections, section{t("Destinations"), rows[:min(len(rows), 6)]})
	}
	unknown := t("unknown")
	sections = append(sections,
		section{t("Sources"), bars(s.Referrers, t("direct"))},
		section{t("Countries"), bars(s.Countries, unknown)},
		section{t("Cities"), bars(s.Cities, unknown)},
		section{t("Devices"), bars(s.Devices, unknown)},
		section{t("Systems"), bars(s.OS, unknown)},
		section{t("Browsers"), bars(s.Browsers, unknown)},
		section{t("Languages"), bars(s.Languages, unknown)},
	)
	// One width for every list, so the bars start in the same column all the way down.
	lists := make([][]ui.Bar, len(sections))
	for i, sec := range sections {
		lists[i] = sec.rows
	}
	labelW := ui.LabelWidth(width-4, lists...)
	for _, sec := range sections {
		if len(sec.rows) == 0 {
			continue
		}
		ui.Println()
		ui.Println("  " + heading(sec.title))
		for _, line := range ui.Bars(sec.rows, s.Totals.Clicks, width-4, labelW) {
			ui.Println("  " + line)
		}
	}
	ui.Println()
}
