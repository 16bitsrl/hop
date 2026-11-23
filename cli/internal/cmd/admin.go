package cmd

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
	"github.com/16bitsrl/hop/cli/internal/ui"
)

func onOff(on bool) string {
	if on {
		return ui.Good.Render(t("on"))
	}
	return ui.Muted.Render(t("off"))
}

func parseOnOff(value string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "on", "true", "yes", "1", "sì", "si":
		return true, nil
	case "off", "false", "no", "0":
		return false, nil
	}
	return false, usage(t("“%s” is not clear: use on or off.", value))
}

/* ------------------------------ settings ------------------------------ */

type slugSettings struct {
	Length   int    `json:"length"`
	Alphabet string `json:"alphabet"`
}
type statsSettings struct {
	RetentionDays *int `json:"retentionDays"`
}
type healthSettings struct {
	Enabled     bool `json:"enabled"`
	RecheckDays int  `json:"recheckDays"`
}
type generalSettings struct {
	Auth struct {
		PasswordLogin bool `json:"passwordLogin"`
	} `json:"auth"`
	OIDC struct {
		Enabled      bool   `json:"enabled"`
		Label        string `json:"label"`
		DiscoveryURL string `json:"discoveryUrl"`
		AutoCreate   bool   `json:"autoCreate"`
		DefaultRole  string `json:"defaultRole"`
	} `json:"oidc"`
	SMTP struct {
		Host string `json:"host"`
		Port int    `json:"port"`
		From string `json:"from"`
	} `json:"smtp"`
	SMTPFromEnvironment bool `json:"smtpFromEnvironment"`
}

func adminOnly(err error) error {
	var apiErr *api.Error
	if errorsAs(err, &apiErr) && apiErr.Status == 403 {
		return fail(t("Only administrators can see and change the settings."))
	}
	return err
}

func (a *app) settingsCmd() *cobra.Command {
	show := func(cmd *cobra.Command) error {
		ctx := cmd.Context()
		srv, err := a.connect()
		if err != nil {
			return err
		}
		var slugs slugSettings
		var stats statsSettings
		var health healthSettings
		var general generalSettings
		for path, out := range map[string]any{"/api/settings/slugs": &slugs, "/api/stats/settings": &stats, "/api/links-health/settings": &health, "/api/settings": &general} {
			if err := srv.Get(ctx, path, nil, out); err != nil {
				return adminOnly(err)
			}
		}
		if a.jsonOut {
			return printJSON(map[string]any{"endings": slugs, "stats": stats, "check": health, "signIn": general.Auth, "singleSignOn": general.OIDC, "email": general.SMTP})
		}
		keep := t("forever")
		if stats.RetentionDays != nil {
			keep = t("%d days", *stats.RetentionDays)
		}
		section := func(title string, fields ...ui.Field) {
			ui.Println()
			ui.Println("  " + heading(title))
			ui.FieldsIndent(fields, 4)
		}
		key := func(name string) string { return ui.Accent.Render(name) }
		section(t("Short link endings"),
			ui.Field{Label: key("endings.length"), Value: strconv.Itoa(slugs.Length) + "  " + ui.Muted.Render(t("characters of a random ending"))},
			ui.Field{Label: key("endings.alphabet"), Value: slugs.Alphabet})
		section(t("Statistics"),
			ui.Field{Label: key("stats.keep"), Value: keep + "  " + ui.Muted.Render(t("how long single clicks are kept"))})
		section(t("Broken link check"),
			ui.Field{Label: key("check.enabled"), Value: onOff(health.Enabled)},
			ui.Field{Label: key("check.every"), Value: t("%d days", health.RecheckDays)})
		sso := onOff(general.OIDC.Enabled)
		if general.OIDC.Enabled && general.OIDC.Label != "" {
			sso += "  " + general.OIDC.Label
		}
		mail := ui.Muted.Render(t("not set up"))
		if general.SMTP.Host != "" {
			mail = general.SMTP.Host + ":" + strconv.Itoa(general.SMTP.Port) + "  " + ui.Muted.Render(general.SMTP.From)
		} else if general.SMTPFromEnvironment {
			mail = t("set where the server is installed")
		}
		section(t("Sign-in and email"),
			ui.Field{Label: t("Password sign-in"), Value: onOff(general.Auth.PasswordLogin)},
			ui.Field{Label: t("Single sign-on"), Value: sso},
			ui.Field{Label: t("Email"), Value: mail})
		ui.Println()
		ui.Println("  " + ui.Muted.Render(t("Change a value with `hop settings set <name> <value>`. Sign-in and email are changed in the app: %s", srv.url+"/settings")))
		ui.Println()
		return nil
	}

	set := &cobra.Command{
		Use:   "set <name> <value>",
		Short: t("Change a setting"),
		Long: t("Change a setting of the server. Names:") + "\n" +
			"  endings.length    " + t("how many characters a random ending has (3 to 32)") + "\n" +
			"  endings.alphabet  " + t("the characters a random ending is made of") + "\n" +
			"  stats.keep        " + t("how many days single clicks are kept, or “forever”") + "\n" +
			"  check.enabled     " + t("check destinations periodically: on or off") + "\n" +
			"  check.every       " + t("days between two checks of the same link (1 to 90)"),
		Example: "hop settings set endings.length 6\nhop settings set stats.keep 365\nhop settings set stats.keep forever\nhop settings set check.enabled off",
		Args:    exactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			name, value := strings.ToLower(args[0]), args[1]
			number := func(lo, hi int) (int, error) {
				n, err := strconv.Atoi(strings.TrimSpace(value))
				if err != nil || n < lo || n > hi {
					return 0, usage(t("%s takes a number from %d to %d.", name, lo, hi))
				}
				return n, nil
			}
			switch name {
			case "endings.length", "endings.alphabet":
				var cur slugSettings
				if err := srv.Get(ctx, "/api/settings/slugs", nil, &cur); err != nil {
					return adminOnly(err)
				}
				if name == "endings.length" {
					if cur.Length, err = number(3, 32); err != nil {
						return err
					}
				} else {
					cur.Alphabet = value
				}
				err = srv.Do(ctx, http.MethodPut, "/api/settings/slugs", nil, cur, nil)
			case "stats.keep":
				body := statsSettings{}
				if v := strings.ToLower(strings.TrimSpace(value)); v != "forever" && v != "sempre" {
					n, err := number(1, 3650)
					if err != nil {
						return usage(t("stats.keep takes a number of days (1 to 3650) or “forever”."))
					}
					body.RetentionDays = &n
				}
				err = srv.Do(ctx, http.MethodPut, "/api/stats/settings", nil, body, nil)
			case "check.enabled", "check.every":
				var cur healthSettings
				if err := srv.Get(ctx, "/api/links-health/settings", nil, &cur); err != nil {
					return adminOnly(err)
				}
				if name == "check.enabled" {
					if cur.Enabled, err = parseOnOff(value); err != nil {
						return err
					}
				} else if cur.RecheckDays, err = number(1, 90); err != nil {
					return err
				}
				err = srv.Do(ctx, http.MethodPut, "/api/links-health/settings", nil, cur, nil)
			default:
				return usageHint(t("There is no setting called “%s”.", args[0]), t("Run `hop settings` to see the names."))
			}
			if err != nil {
				return adminOnly(err)
			}
			ui.Success(t("Saved %s", ui.Bold.Render(name)))
			return nil
		},
	}
	cmd := &cobra.Command{
		Use:   "settings",
		Short: t("See and change the settings of the server"),
		Args:  noArgs,
		RunE:  func(cmd *cobra.Command, _ []string) error { return show(cmd) },
	}
	cmd.AddCommand(set)
	return cmd
}

/* ------------------------------ blocked destinations ------------------------------ */

type blockedDomain struct {
	ID     string  `json:"id"`
	Host   string  `json:"host"`
	Reason *string `json:"reason"`
}

func (srv *server) blocked(ctx context.Context) ([]blockedDomain, error) {
	var out struct {
		Blocked []blockedDomain `json:"blocked"`
	}
	return out.Blocked, srv.Get(ctx, "/api/blocked-domains", nil, &out)
}

func (a *app) blockedCmd() *cobra.Command {
	list := func(cmd *cobra.Command) error {
		srv, err := a.connect()
		if err != nil {
			return err
		}
		rows, err := srv.blocked(cmd.Context())
		if err != nil {
			return adminOnly(err)
		}
		if a.jsonOut {
			return printJSON(map[string]any{"blocked": rows})
		}
		if len(rows) == 0 {
			ui.Info(t("No website is blocked."))
			return nil
		}
		table := ui.Table{Headers: []string{t("Website"), t("Reason")}, Flex: 1}
		for _, b := range rows {
			table.Rows = append(table.Rows, []string{b.Host, deref(b.Reason)})
		}
		table.Print()
		return nil
	}
	var reason string
	add := &cobra.Command{
		Use:   "add <website>",
		Short: t("Stop links from pointing to a website"),
		Args:  exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			body := map[string]any{"host": args[0]}
			if reason != "" {
				body["reason"] = reason
			}
			if err := srv.Do(cmd.Context(), http.MethodPost, "/api/blocked-domains", nil, body, nil); err != nil {
				return adminOnly(err)
			}
			ui.Success(t("Links can no longer point to %s", ui.Bold.Render(args[0])))
			return nil
		},
	}
	add.Flags().StringVar(&reason, "reason", "", t("Why it is blocked"))
	rm := &cobra.Command{
		Use:     "rm <website>",
		Aliases: []string{"delete", "remove"},
		Short:   t("Allow a website again"),
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			rows, err := srv.blocked(cmd.Context())
			if err != nil {
				return adminOnly(err)
			}
			for _, b := range rows {
				if b.ID == args[0] || strings.EqualFold(b.Host, args[0]) {
					if err := srv.Do(cmd.Context(), http.MethodDelete, "/api/blocked-domains/"+b.ID, nil, nil, nil); err != nil {
						return err
					}
					ui.Success(t("%s is allowed again", ui.Bold.Render(b.Host)))
					return nil
				}
			}
			return fail(t("%s is not in the list of blocked websites.", args[0]))
		},
	}
	return parent("blocked", t("See and manage blocked websites"), nil, list, add, rm)
}

/* ------------------------------ users, activity ------------------------------ */

func (a *app) usersCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "users",
		Short: t("List the people of the team"),
		Long:  t("List the people of the team and the pending invitations. Inviting people and changing roles is done in the app."),
		Args:  noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			var users struct {
				Users []struct {
					ID, Name, Email, Role string
					Disabled              bool
				} `json:"users"`
			}
			var invites struct {
				Invites []struct{ ID, Email, Role string } `json:"invites"`
			}
			if err := srv.Get(ctx, "/api/users", nil, &users); err != nil {
				return adminOnly(err)
			}
			if err := srv.Get(ctx, "/api/invites", nil, &invites); err != nil {
				return adminOnly(err)
			}
			if a.jsonOut {
				return printJSON(map[string]any{"users": users.Users, "invites": invites.Invites})
			}
			table := ui.Table{Headers: []string{t("Person"), t("Email"), t("Role"), t("State")}, Flex: 1}
			for _, u := range users.Users {
				state := ui.Good.Render(t("active"))
				if u.Disabled {
					state = ui.Muted.Render(t("off"))
				}
				table.Rows = append(table.Rows, []string{u.Name, u.Email, roleName(u.Role), state})
			}
			for _, inv := range invites.Invites {
				table.Rows = append(table.Rows, []string{"", inv.Email, roleName(inv.Role), ui.Warn.Render(t("invited"))})
			}
			table.Print()
			return nil
		},
	}
}

func (a *app) auditCmd() *cobra.Command {
	var action, kind string
	var page int
	cmd := &cobra.Command{
		Use:     "activity",
		Aliases: []string{"audit", "log"},
		Short:   t("Show who did what on the server"),
		Example: "hop activity\nhop activity --type link --action link.delete",
		Args:    noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			var raw jsonRaw
			q := api.Query{"action": action, "entityType": kind, "page": strconv.Itoa(max(page, 1))}
			if err := srv.Get(cmd.Context(), "/api/audit", q, &raw); err != nil {
				return adminOnly(err)
			}
			if a.jsonOut {
				return printJSON(raw)
			}
			var out struct {
				Items []api.HistoryItem `json:"items"`
				Total int               `json:"total"`
			}
			if err := json.Unmarshal(raw, &out); err != nil {
				return err
			}
			if len(out.Items) == 0 {
				ui.Info(t("Nothing here."))
				return nil
			}
			table := ui.Table{Headers: []string{t("When"), t("Who"), t("What"), t("About")}, Flex: 3}
			for _, item := range out.Items {
				about := ""
				for _, k := range []string{"email", "name", "host", "slug"} {
					if v, ok := item.Data[k].(string); ok && about == "" {
						about = v
					}
				}
				for _, side := range []string{"after", "before"} {
					if m, ok := item.Data[side].(map[string]any); ok && about == "" {
						for _, k := range []string{"slug", "host", "name"} {
							if v, ok := m[k].(string); ok && about == "" {
								about = v
							}
						}
					}
				}
				table.Rows = append(table.Rows, []string{dayTime(item.Ts), deref(item.UserName), item.Action, ui.Muted.Render(about)})
			}
			table.Print()
			if ui.OutTTY && out.Total > len(out.Items) {
				ui.Println()
				ui.Println("  " + ui.Muted.Render(t("%s lines in all. Next page: --page %d", ui.Number(out.Total), max(page, 1)+1)))
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&action, "action", "", t("Only actions starting with this text (link., user., key.create…)"))
	cmd.Flags().StringVar(&kind, "type", "", t("Only this kind of thing: link, domain, user, api_key, settings…"))
	cmd.Flags().IntVarP(&page, "page", "p", 1, t("Which page"))
	return cmd
}

/* ------------------------------ profile ------------------------------ */

func (a *app) profileCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "profile",
		Short: t("See and change your profile"),
		Args:  noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			user, err := whoAmI(ctx, srv.Client)
			if err != nil {
				return err
			}
			if user == nil {
				return &api.Error{Status: 401, Code: "unauthorized"}
			}
			if a.jsonOut {
				return printJSON(map[string]any{"user": user})
			}
			domain := t("the server's default")
			if user.DefaultDomainID != nil {
				if domains, err := srv.domains(ctx); err == nil {
					for _, d := range domains {
						if d.ID == *user.DefaultDomainID {
							domain = d.Host
						}
					}
				}
			}
			language := t("the browser's")
			if user.Locale != nil {
				language = *user.Locale
			}
			key := func(name string) string { return ui.Accent.Render(name) }
			ui.Println()
			ui.Fields([]ui.Field{
				{Label: key("name"), Value: user.Name},
				{Label: t("Email"), Value: user.Email},
				{Label: t("Role"), Value: roleName(user.Role)},
				{Label: key("language"), Value: language + "  " + ui.Muted.Render(t("of the web app and of the emails you get"))},
				{Label: key("domain"), Value: domain + "  " + ui.Muted.Render(t("used for your new links"))},
			})
			ui.Println()
			ui.Println("  " + ui.Muted.Render(t("Change a value with `hop profile set <name> <value>`.")))
			ui.Println()
			return nil
		},
	}
	cmd.AddCommand(&cobra.Command{
		Use:     "set <name> <value>",
		Short:   t("Change your name, language or default domain"),
		Example: "hop profile set name \"Ada Lovelace\"\nhop profile set language it\nhop profile set domain go.example.com\nhop profile set domain default",
		Args:    exactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			body := map[string]any{}
			value := strings.TrimSpace(args[1])
			switch strings.ToLower(args[0]) {
			case "name":
				body["name"] = value
			case "language":
				switch strings.ToLower(value) {
				case "en", "it":
					body["locale"] = strings.ToLower(value)
				case "auto", "default", "browser":
					body["locale"] = nil
				default:
					return usage(t("The language can be en, it or auto."))
				}
			case "domain":
				if strings.EqualFold(value, "default") || value == "" {
					body["defaultDomainId"] = nil
				} else if body["defaultDomainId"], err = srv.domainID(ctx, value); err != nil {
					return err
				}
			default:
				return usage(t("You can change: name, language, domain."))
			}
			var out struct {
				User api.User `json:"user"`
			}
			if err := srv.Do(ctx, http.MethodPatch, "/api/me", nil, body, &out); err != nil {
				return err
			}
			if s := a.cfg.Servers[srv.name]; s != nil && out.User.Name != "" {
				s.User = out.User.Name
				_ = a.cfg.Save()
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Saved %s", ui.Bold.Render(strings.ToLower(args[0]))))
			return nil
		},
	})
	return cmd
}

/* ------------------------------ raw requests ------------------------------ */

func (a *app) apiCmd() *cobra.Command {
	var method, data string
	var query []string
	cmd := &cobra.Command{
		Use:   "api <path>",
		Short: t("Call the server's API directly"),
		Long: t("Call the server's API directly, signed in as you, and print the answer. For what the other commands don't cover.") + "\n\n" +
			t("The method is GET, or POST when you send data; change it with -X. Data starting with @ is read from a file (@- is the standard input)."),
		Example: "hop api /api/links -q pageSize=5\nhop api /api/tags -d '{\"name\":\"promo\"}'\nhop api /api/links/<id> -X DELETE",
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			path := args[0]
			if !strings.HasPrefix(path, "/") {
				path = "/" + path
			}
			if !strings.HasPrefix(path, "/api/") {
				path = "/api" + path
			}
			q := api.Query{}
			for _, pair := range query {
				k, v, ok := strings.Cut(pair, "=")
				if !ok {
					return usage(t("Write query values as name=value: %s", pair))
				}
				q[k] = v
			}
			var body any
			if data != "" {
				payload := []byte(data)
				if data == "@-" {
					payload, err = io.ReadAll(os.Stdin)
				} else if strings.HasPrefix(data, "@") {
					payload, err = os.ReadFile(data[1:])
				}
				if err != nil {
					return fail(t("The file could not be read: %s", err.Error()))
				}
				body = payload
			}
			if method == "" {
				method = http.MethodGet
				if body != nil {
					method = http.MethodPost
				}
			}
			out, headers, err := srv.Raw(cmd.Context(), strings.ToUpper(method), path, q, body)
			if len(out) > 0 {
				if strings.Contains(headers.Get("Content-Type"), "json") {
					_ = printJSON(jsonRaw(out))
				} else {
					_, _ = os.Stdout.Write(out)
				}
			}
			if err != nil {
				var apiErr *api.Error
				if errorsAs(err, &apiErr) {
					return &failure{msg: t("The server answered %d.", apiErr.Status), code: 1}
				}
				return err
			}
			return nil
		},
	}
	cmd.Flags().StringVarP(&method, "method", "X", "", t("HTTP method: GET, POST, PATCH, PUT, DELETE"))
	cmd.Flags().StringVarP(&data, "data", "d", "", t("JSON to send, or @file"))
	cmd.Flags().StringArrayVarP(&query, "query", "q", nil, t("Add name=value to the address; repeat for more"))
	return cmd
}
