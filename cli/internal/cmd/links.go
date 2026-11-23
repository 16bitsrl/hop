package cmd

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"charm.land/huh/v2"
	"github.com/atotto/clipboard"
	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
	"github.com/16bitsrl/hop/cli/internal/ui"
)

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func day(when time.Time) string { return when.Local().Format("2006-01-02") }

func dayTime(when time.Time) string { return when.Local().Format("2006-01-02 15:04") }

func stateName(state string) string {
	switch state {
	case "active":
		return t("active")
	case "disabled":
		return t("off")
	case "expired":
		return t("expired")
	case "broken":
		return t("broken")
	case "protected":
		return t("password")
	}
	return state
}

func stateLabel(states []string) string {
	parts := make([]string, 0, len(states))
	for _, s := range states {
		name := stateName(s)
		switch s {
		case "active":
			name = ui.Good.Render(name)
		case "disabled":
			name = ui.Muted.Render(name)
		case "expired":
			name = ui.Warn.Render(name)
		case "broken":
			name = ui.Bad.Render(name)
		}
		parts = append(parts, name)
	}
	return strings.Join(parts, ", ")
}

func tagNames(tags []api.Tag) string {
	names := make([]string, len(tags))
	for i, tag := range tags {
		names[i] = tag.Name
	}
	return strings.Join(names, ", ")
}

/* ------------------------------------------------------------------ */
/* create                                                              */
/* ------------------------------------------------------------------ */

func (a *app) createCmd() *cobra.Command {
	var flags linkFlags
	var copyIt, showQR bool
	cmd := &cobra.Command{
		Use:     "create [address]",
		Aliases: []string{"new", "add", "shorten"},
		Short:   t("Create a short link"),
		Long: t("Create a short link.") + "\n\n" +
			t("Only the destination is needed; without it, hop asks for the details. In a script, the short link is the only thing written to the standard output."),
		Example: "hop create https://example.com/spring-sale\n" +
			"hop create https://example.com/spring-sale --slug spring --tag promo,newsletter --copy\n" +
			"hop https://example.com/spring-sale --expires 30d --qr\n" +
			"# " + t("One link for the App Store, Google Play and the website") + "\n" +
			"hop create https://example.com/app --rule \"device=ios url=https://apps.apple.com/app/id1\" --rule \"device=android url=https://play.google.com/store/apps/details?id=x\"",
		Args: maxArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			body, err := flags.body(ctx, cmd, srv, nil)
			if err != nil {
				return err
			}
			if len(args) == 1 {
				body["url"] = args[0]
			} else {
				if !ui.InTTY || !ui.ErrTTY {
					return usage(t("Which address do you want to shorten? Add it: hop create https://example.com/page"))
				}
				if err := a.askLink(ctx, srv, body); err != nil {
					return err
				}
			}
			var out struct {
				Link api.Link `json:"link"`
			}
			if err := srv.Do(ctx, http.MethodPost, "/api/links", nil, body, &out); err != nil {
				return err
			}
			link := out.Link
			if copyIt {
				if err := clipboard.WriteAll(link.ShortURL); err != nil {
					ui.Warning(t("The link could not be copied to the clipboard."))
					copyIt = false
				}
			}
			if a.jsonOut {
				return printJSON(out)
			}
			if !ui.OutTTY {
				ui.Println(link.ShortURL)
				return nil
			}
			ui.Success(t("Short link created"))
			ui.Println()
			ui.Println("  " + ui.Accent.Bold(true).Render(link.ShortURL))
			ui.Println("  " + ui.Muted.Render("→ "+ui.Truncate(link.URL, max(20, ui.Width()-6))))
			if copyIt {
				ui.Println("  " + ui.Muted.Render(t("Copied to the clipboard.")))
			}
			if showQR {
				draw := ui.QRPlain
				if ui.Colors() {
					draw = ui.QR
				}
				code, err := draw(link.ShortURL)
				if err != nil {
					return err
				}
				ui.Println()
				ui.Println(code)
			}
			ui.Println()
			return nil
		},
	}
	flags.bind(cmd, true)
	cmd.Flags().BoolVarP(&copyIt, "copy", "c", false, t("Copy the short link to the clipboard"))
	cmd.Flags().BoolVar(&showQR, "qr", false, t("Show the QR code of the new link"))
	return cmd
}

// askLink asks for the essentials of a new link: destination, ending, title and, with several
// domains, which one.
func (a *app) askLink(ctx context.Context, srv *server, body map[string]any) error {
	var address, slug, title, domain string
	fields := []huh.Field{
		huh.NewInput().Title(t("Address to shorten")).Placeholder("https://example.com/page").Value(&address).Validate(func(s string) error {
			if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") {
				return fail(t("Start with https:// or http://"))
			}
			return nil
		}),
	}
	if _, given := body["slug"]; !given {
		fields = append(fields, huh.NewInput().Title(t("Ending")).Description(t("Leave empty for a random one.")).Value(&slug))
	}
	if _, given := body["title"]; !given {
		fields = append(fields, huh.NewInput().Title(t("Title")).Description(t("Leave empty to use the title of the page.")).Value(&title))
	}
	if _, given := body["domainId"]; !given {
		if domains, err := srv.domains(ctx); err == nil && len(domains) > 1 {
			options := make([]huh.Option[string], 0, len(domains)+1)
			options = append(options, huh.NewOption(t("Your default domain"), ""))
			for _, d := range domains {
				options = append(options, huh.NewOption(d.Host, d.ID))
			}
			fields = append(fields, huh.NewSelect[string]().Title(t("Domain")).Options(options...).Value(&domain))
		}
	}
	if err := ui.RunForm(fields...); err != nil {
		return err
	}
	body["url"] = strings.TrimSpace(address)
	if s := strings.TrimSpace(slug); s != "" {
		body["slug"] = s
	}
	if s := strings.TrimSpace(title); s != "" {
		body["title"] = s
	}
	if domain != "" {
		body["domainId"] = domain
	}
	return nil
}

/* ------------------------------------------------------------------ */
/* list                                                                */
/* ------------------------------------------------------------------ */

func (a *app) listCmd() *cobra.Command {
	var search, tag, folder, domain, owner, state, sortBy string
	var limit, page int
	var asc, all bool
	cmd := &cobra.Command{
		Use:     "list",
		Aliases: []string{"ls", "links"},
		Short:   t("List and search links"),
		Example: "hop list\n" +
			"hop list --search sale --tag promo --sort clicks\n" +
			"hop list --owner me --state broken\n" +
			"# " + t("Every link, as JSON") + "\n" +
			"hop list --all --json",
		Args: noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			q := api.Query{"q": search}
			if tag != "" {
				found, err := srv.tagByName(ctx, tag)
				if err != nil {
					return err
				}
				q["tag"] = found.ID
			}
			if folder != "" {
				if strings.EqualFold(folder, "none") {
					q["folder"] = "none"
				} else if q["folder"], err = srv.folderID(ctx, folder); err != nil {
					return err
				}
			}
			if domain != "" {
				if q["domain"], err = srv.domainID(ctx, domain); err != nil {
					return err
				}
			}
			if owner != "" {
				if q["owner"], err = srv.ownerID(ctx, owner); err != nil {
					return err
				}
			}
			switch state {
			case "":
			case "active", "disabled", "expired", "broken", "protected":
				q["state"] = state
			case "off":
				q["state"] = "disabled"
			case "password":
				q["state"] = "protected"
			default:
				return usage(t("The state can be: active, off, expired, broken or password."))
			}
			switch sortBy {
			case "", "created":
			case "clicks", "slug":
				q["sort"] = sortBy
			case "last-click":
				q["sort"] = "lastClick"
			default:
				return usage(t("Sort by: created, clicks, last-click or slug."))
			}
			if asc {
				q["dir"] = "asc"
			}
			if limit < 1 || limit > 100 {
				return usage(t("--limit goes from 1 to 100. Use --all to get everything."))
			}
			q["pageSize"] = strconv.Itoa(limit)
			q["page"] = strconv.Itoa(max(page, 1))

			var result api.LinkPage
			if all {
				q["pageSize"] = "100"
				for p := 1; ; p++ {
					q["page"] = strconv.Itoa(p)
					var one api.LinkPage
					if err := srv.Get(ctx, "/api/links", q, &one); err != nil {
						return err
					}
					result.Items = append(result.Items, one.Items...)
					result.Total, result.Page, result.PageSize = one.Total, 1, one.Total
					if len(one.Items) == 0 || len(result.Items) >= one.Total {
						break
					}
				}
			} else if err := srv.Get(ctx, "/api/links", q, &result); err != nil {
				return err
			}
			if a.jsonOut {
				if result.Items == nil {
					result.Items = []api.Link{}
				}
				return printJSON(result)
			}
			if len(result.Items) == 0 {
				if result.Total == 0 && search == "" && tag == "" && folder == "" && domain == "" && owner == "" && state == "" {
					ui.Info(t("No links yet."))
					ui.Hint(t("Create the first one: %s", "hop create https://example.com/page"))
				} else {
					ui.Info(t("No links match."))
				}
				return nil
			}
			printLinks(result.Items)
			if ui.OutTTY && !all && result.Total > len(result.Items) {
				first := (result.Page-1)*result.PageSize + 1
				ui.Println()
				ui.Println("  " + ui.Muted.Render(t("%d to %d of %s. Next page: --page %d", first, first+len(result.Items)-1, ui.Number(result.Total), result.Page+1)))
			}
			return nil
		},
	}
	f := cmd.Flags()
	f.StringVarP(&search, "search", "q", "", t("Look for this text in the ending, destination, title and notes"))
	f.StringVar(&tag, "tag", "", t("Only links with this tag"))
	f.StringVar(&folder, "folder", "", t("Only links in this folder and the ones inside it (“none”: links in no folder)"))
	f.StringVarP(&domain, "domain", "d", "", t("Only links of this short domain"))
	f.StringVar(&owner, "owner", "", t("Only links of this person (“me” for yours)"))
	f.StringVar(&state, "state", "", t("Only links in this state: active, off, expired, broken, password"))
	f.StringVar(&sortBy, "sort", "", t("Order by: created (default), clicks, last-click, slug"))
	f.BoolVar(&asc, "asc", false, t("Smallest or oldest first"))
	f.IntVarP(&limit, "limit", "n", 25, t("How many links per page (up to 100)"))
	f.IntVarP(&page, "page", "p", 1, t("Which page"))
	f.BoolVar(&all, "all", false, t("Every link, not one page"))
	return cmd
}

func printLinks(links []api.Link) {
	withTags := false
	for _, l := range links {
		withTags = withTags || len(l.Tags) > 0
	}
	if !ui.OutTTY {
		for _, l := range links {
			ui.Println(strings.Join([]string{l.ShortURL, l.URL, strconv.Itoa(l.ClickCount), strings.Join(l.States, ","), l.CreatedAt.UTC().Format(time.RFC3339), tagNames(l.Tags)}, "\t"))
		}
		return
	}
	table := ui.Table{Headers: []string{t("Short link"), t("Destination"), t("Clicks"), t("State"), t("Created")}, Right: []int{2}, Flex: 1}
	if withTags {
		table.Headers = append(table.Headers, t("Tags"))
	}
	for _, l := range links {
		row := []string{ui.Accent.Render(l.Host + "/" + l.Slug), strings.TrimPrefix(strings.TrimPrefix(l.URL, "https://"), "http://"), ui.Number(l.ClickCount), stateLabel(l.States), ui.Muted.Render(day(l.CreatedAt))}
		if withTags {
			row = append(row, ui.Muted.Render(tagNames(l.Tags)))
		}
		table.Rows = append(table.Rows, row)
	}
	table.Print()
}

/* ------------------------------------------------------------------ */
/* show                                                                */
/* ------------------------------------------------------------------ */

func describeRule(r api.Rule) string {
	var when []string
	if len(r.Devices) > 0 {
		when = append(when, strings.Join(r.Devices, ", "))
	}
	if len(r.Countries) > 0 {
		when = append(when, strings.Join(r.Countries, ", "))
	}
	if len(r.Languages) > 0 {
		when = append(when, strings.Join(r.Languages, ", "))
	}
	out := strings.Join(when, " + ") + " → " + r.URL
	if r.AppURL != "" {
		out += " (" + r.AppURL + ")"
	}
	return out
}

func (a *app) printLink(ctx context.Context, srv *server, l *api.Link) {
	ui.Println()
	ui.Println("  " + ui.Accent.Bold(true).Render(l.ShortURL) + "  " + stateLabel(l.States))
	if title := deref(l.Title); title != "" {
		ui.Println("  " + title)
	}
	ui.Println()
	clicks := ui.Number(l.ClickCount)
	if l.LastClickedAt != nil {
		clicks += ui.Muted.Render("  " + t("last on %s", dayTime(*l.LastClickedAt)))
	}
	folder := ""
	if l.FolderID != nil {
		if all, err := srv.folders(ctx); err == nil {
			folder = folderPath(all, *l.FolderID)
		}
	}
	expires := ""
	if l.ExpiresAt != nil {
		expires = dayTime(*l.ExpiresAt)
	}
	maxClicks := ""
	if l.MaxClicks != nil {
		maxClicks = ui.Number(*l.MaxClicks)
	}
	yes := func(on bool) string {
		if on {
			return t("yes")
		}
		return ""
	}
	var rules, variants []string
	for _, r := range l.Rules {
		rules = append(rules, describeRule(r))
	}
	total := 0
	for _, v := range l.Variants {
		total += v.Weight
	}
	for _, v := range l.Variants {
		variants = append(variants, strconv.Itoa(v.Weight*100/max(total, 1))+"%  "+v.URL)
	}
	health := ""
	switch l.HealthStatus {
	case "ok":
		health = ui.Good.Render(t("the destination answers"))
	case "broken":
		health = ui.Bad.Render(t("the destination does not answer"))
		if l.HealthCode != nil && *l.HealthCode > 0 {
			health += " (" + strconv.Itoa(*l.HealthCode) + ")"
		}
	}
	if health != "" && l.HealthCheckedAt != nil {
		health += ui.Muted.Render("  " + t("checked on %s", dayTime(*l.HealthCheckedAt)))
	}
	redirect := ""
	if l.RedirectType != 302 {
		redirect = strconv.Itoa(l.RedirectType)
	}
	publicStats := ""
	if l.PublicStats {
		publicStats = srv.url + "/s/" + l.ID
	}
	preview := strings.TrimSpace(strings.Join([]string{deref(l.OgTitle), deref(l.OgDescription), deref(l.OgImage)}, "\n"))
	ui.Fields([]ui.Field{
		{Label: t("Destination"), Value: l.URL},
		{Label: t("Clicks"), Value: clicks},
		{Label: t("Tags"), Value: tagNames(l.Tags)},
		{Label: t("Folder"), Value: folder},
		{Label: t("Owner"), Value: deref(l.OwnerName)},
		{Label: t("Created"), Value: dayTime(l.CreatedAt)},
		{Label: t("Expires"), Value: expires},
		{Label: t("Click limit"), Value: maxClicks},
		{Label: t("After expiry"), Value: deref(l.FallbackURL)},
		{Label: t("Password"), Value: yes(l.HasPassword)},
		{Label: t("Redirect type"), Value: redirect},
		{Label: t("Forwards ?…"), Value: yes(l.ForwardQuery)},
		{Label: t("Rules"), Value: strings.Join(rules, "\n")},
		{Label: t("A/B test"), Value: strings.Join(variants, "\n")},
		{Label: t("App link"), Value: deref(l.AppURL)},
		{Label: t("Share preview"), Value: preview},
		{Label: t("Public statistics"), Value: publicStats},
		{Label: t("Check"), Value: health},
		{Label: t("Notes"), Value: deref(l.Notes)},
		{Label: t("In the app"), Value: ui.Muted.Render(srv.url + "/links/" + l.ID)},
	})
	ui.Println()
}

func (a *app) showCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "show <link>",
		Aliases: []string{"get", "info", "view"},
		Short:   t("Show everything about a link"),
		Long:    t("Show everything about a link.") + "\n\n" + linkRefHelp(),
		Example: "hop show spring\nhop show go.example.com/spring",
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			link, err := srv.findLink(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(map[string]any{"link": link})
			}
			a.printLink(cmd.Context(), srv, link)
			return nil
		},
	}
}

func linkRefHelp() string {
	return t("A link can be named by its ending (spring), its short address (go.example.com/spring) or its id.")
}

/* ------------------------------------------------------------------ */
/* edit, remove, enable, disable                                       */
/* ------------------------------------------------------------------ */

func (a *app) editCmd() *cobra.Command {
	var flags linkFlags
	cmd := &cobra.Command{
		Use:     "edit <link>",
		Aliases: []string{"change"},
		Short:   t("Change a link"),
		Long: t("Change a link. Only what you name changes; the short address stays the same, so printed QR codes and shared links keep working.") +
			"\n\n" + linkRefHelp() + " " + t("An empty text (--title \"\") removes that value."),
		Example: "hop edit spring --url https://example.com/summer-sale\n" +
			"hop edit spring --add-tag summer --expires 2026-08-31\n" +
			"hop edit spring --variant 50:https://example.com/a --variant 50:https://example.com/b",
		Args: exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			link, err := srv.findLink(ctx, args[0])
			if err != nil {
				return err
			}
			body, err := flags.body(ctx, cmd, srv, link)
			if err != nil {
				return err
			}
			if len(body) == 0 {
				return usageHint(t("Nothing to change: name what to change."), t("For example: hop edit %s --title \"New title\". See `hop help edit`.", link.Slug))
			}
			var out struct {
				Link api.Link `json:"link"`
			}
			if err := srv.Do(ctx, http.MethodPatch, "/api/links/"+link.ID, nil, body, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Saved %s", ui.Bold.Render(out.Link.Host+"/"+out.Link.Slug)))
			if ui.OutTTY {
				a.printLink(ctx, srv, &out.Link)
			}
			return nil
		},
	}
	flags.bind(cmd, false)
	return cmd
}

// findLinks resolves several references, stopping at the first that is not found.
func (srv *server) findLinks(ctx context.Context, refs []string) ([]*api.Link, error) {
	links := make([]*api.Link, 0, len(refs))
	for _, ref := range refs {
		link, err := srv.findLink(ctx, ref)
		if err != nil {
			return nil, err
		}
		links = append(links, link)
	}
	return links, nil
}

func (a *app) removeCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "rm <link>...",
		Aliases: []string{"delete", "remove"},
		Short:   t("Delete links"),
		Long:    t("Delete one or more links. They stop working at once and their statistics go with them: this can't be undone.") + "\n\n" + linkRefHelp(),
		Example: "hop rm spring\nhop rm spring summer --yes",
		Args:    minArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			links, err := srv.findLinks(ctx, args)
			if err != nil {
				return err
			}
			question := t("Delete %s? This can't be undone.", links[0].Host+"/"+links[0].Slug)
			if len(links) > 1 {
				question = t("Delete these %d links? This can't be undone.", len(links))
				for _, l := range links {
					ui.Hint(l.Host + "/" + l.Slug + "  → " + l.URL)
				}
			}
			if err := a.confirm(question); err != nil {
				return err
			}
			for _, l := range links {
				if err := srv.Do(ctx, http.MethodDelete, "/api/links/"+l.ID, nil, nil, nil); err != nil {
					return err
				}
				if !a.jsonOut {
					ui.Success(t("Deleted %s", l.Host+"/"+l.Slug))
				}
			}
			if a.jsonOut {
				return printJSON(map[string]any{"deleted": len(links)})
			}
			return nil
		},
	}
	a.yesFlag(cmd)
	return cmd
}

func (a *app) enableCmd(on bool) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "enable <link>...",
		Short: t("Turn links back on"),
		Args:  minArgs(1),
	}
	if !on {
		cmd.Use = "disable <link>..."
		cmd.Short = t("Turn links off without deleting them")
	}
	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		srv, err := a.connect()
		if err != nil {
			return err
		}
		links, err := srv.findLinks(ctx, args)
		if err != nil {
			return err
		}
		for _, l := range links {
			if err := srv.Do(ctx, http.MethodPatch, "/api/links/"+l.ID, nil, map[string]any{"enabled": on}, nil); err != nil {
				return err
			}
			if a.jsonOut {
				continue
			}
			if on {
				ui.Success(t("%s is on", l.Host+"/"+l.Slug))
			} else {
				ui.Success(t("%s is off", l.Host+"/"+l.Slug))
			}
		}
		if a.jsonOut {
			return printJSON(map[string]any{"changed": len(links), "enabled": on})
		}
		return nil
	}
	return cmd
}

/* ------------------------------------------------------------------ */
/* open, check, history                                                */
/* ------------------------------------------------------------------ */

func (a *app) openCmd() *cobra.Command {
	var inApp bool
	cmd := &cobra.Command{
		Use:   "open [link]",
		Short: t("Open a link, or hop itself, in the browser"),
		Long:  t("Open a short link in the browser. With --app it opens the link's page in hop; without a link, it opens hop."),
		Args:  maxArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			target := srv.url
			if len(args) == 1 {
				link, err := srv.findLink(cmd.Context(), args[0])
				if err != nil {
					return err
				}
				target = link.ShortURL
				if inApp {
					target = srv.url + "/links/" + link.ID
				}
			}
			if err := openBrowser(target); err != nil {
				ui.Println(target)
				return nil
			}
			ui.Success(t("Opening %s", target))
			return nil
		},
	}
	cmd.Flags().BoolVar(&inApp, "app", false, t("Open the link's page in hop instead of following it"))
	return cmd
}

func (a *app) checkCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "check <link>",
		Short: t("Check that a link's destination still answers"),
		Args:  exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			link, err := srv.findLink(ctx, args[0])
			if err != nil {
				return err
			}
			var out struct {
				Link api.Link `json:"link"`
			}
			err = ui.Spin(ctx, t("Checking %s…", link.URL), func(ctx context.Context) error {
				return srv.Do(ctx, http.MethodPost, "/api/links/"+link.ID+"/check", nil, map[string]any{}, &out)
			})
			if err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			code := ""
			if out.Link.HealthCode != nil && *out.Link.HealthCode > 0 {
				code = " (" + strconv.Itoa(*out.Link.HealthCode) + ")"
			}
			switch out.Link.HealthStatus {
			case "ok":
				ui.Success(t("The destination answers%s.", code))
			case "broken":
				ui.Failure(t("The destination does not answer%s.", code), out.Link.URL)
			default:
				ui.Info(t("The destination could not be checked right now."))
			}
			return nil
		},
	}
}

func changedFields(data map[string]any) string {
	after, _ := data["after"].(map[string]any)
	before, _ := data["before"].(map[string]any)
	if len(after) == 0 || len(before) == 0 {
		return ""
	}
	keys := make([]string, 0, len(after))
	for k := range after {
		keys = append(keys, k)
	}
	sortStrings(keys)
	return strings.Join(keys, ", ")
}

func actionName(action string) string {
	switch action {
	case "link.create":
		return t("created")
	case "link.update":
		return t("changed")
	case "link.delete":
		return t("deleted")
	}
	return action
}

func (a *app) historyCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "history <link>",
		Short: t("Show who changed a link, and when"),
		Args:  exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			link, err := srv.findLink(ctx, args[0])
			if err != nil {
				return err
			}
			var out struct {
				Items []api.HistoryItem `json:"items"`
			}
			if err := srv.Get(ctx, "/api/links/"+link.ID+"/history", nil, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			table := ui.Table{Headers: []string{t("When"), t("Who"), t("What"), t("Changed")}, Flex: 3}
			for _, item := range out.Items {
				table.Rows = append(table.Rows, []string{dayTime(item.Ts), deref(item.UserName), actionName(item.Action), ui.Muted.Render(changedFields(item.Data))})
			}
			table.Print()
			return nil
		},
	}
}
