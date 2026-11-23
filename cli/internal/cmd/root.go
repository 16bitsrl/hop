// Package cmd holds the commands of the app.
package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/signal"
	"strings"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
	"github.com/16bitsrl/hop/cli/internal/config"
	"github.com/16bitsrl/hop/cli/internal/i18n"
	"github.com/16bitsrl/hop/cli/internal/ui"
	"github.com/16bitsrl/hop/cli/internal/update"
)

var t = i18n.T

// app is what every command shares.
type app struct {
	version string
	cfg     *config.Config
	root    *cobra.Command

	serverFlag string
	jsonOut    bool
	yes        bool

	updates *updateWatch
}

// failure is an error with a hint on what to do next; it is shown without "Error:" noise.
type failure struct {
	msg, hint string
	code      int
}

func (f *failure) Error() string { return f.msg }

func fail(msg string) error            { return &failure{msg: msg, code: 1} }
func failHint(msg, hint string) error  { return &failure{msg: msg, hint: hint, code: 1} }
func usage(msg string) error           { return &failure{msg: msg, code: 2} }
func usageHint(msg, hint string) error { return &failure{msg: msg, hint: hint, code: 2} }

// Run executes the app and returns its exit code.
func Run(version string, args []string) int {
	cfg, cfgErr := config.Load()
	i18n.Init(cfg.Language)
	noColor := false
	for _, a := range args {
		if a == "--no-color" {
			noColor = true
		}
	}
	ui.Init(os.Stdout, os.Stderr, noColor)
	if i18n.Lang() == "it" {
		ui.SetThousands(".")
	}
	update.CleanUp()
	refreshSkills()

	a := &app{version: version, cfg: cfg}
	if cfgErr != nil {
		ui.Warning(t("The settings file could not be read, so it is ignored: %s", cfg.Path()))
	}
	// `hop https://example.com/page` is short for `hop create https://example.com/page`.
	if len(args) > 0 && (strings.HasPrefix(args[0], "http://") || strings.HasPrefix(args[0], "https://")) {
		args = append([]string{"create"}, args...)
	}
	cobra.EnableCommandSorting = false
	a.root = a.newRoot()
	a.root.SetArgs(args)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	err := a.root.ExecuteContext(ctx)
	if err != nil {
		return a.report(err)
	}
	a.finishUpdateCheck(ctx)
	return 0
}

func (a *app) newRoot() *cobra.Command {
	root := &cobra.Command{
		Use:           "hop",
		Short:         t("Short links from your terminal"),
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.ArbitraryArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) > 0 {
				return usageHint(t("Unknown command: %s", args[0]), t("Run `hop help` to see what hop can do."))
			}
			a.overview(cmd)
			return nil
		},
		PersistentPreRun: func(cmd *cobra.Command, _ []string) { a.startUpdateCheck(cmd) },
	}
	root.Version = a.version
	root.SetVersionTemplate("hop {{.Version}}\n")
	root.CompletionOptions.DisableDefaultCmd = true
	root.SetFlagErrorFunc(flagError)
	pf := root.PersistentFlags()
	pf.StringVarP(&a.serverFlag, "server", "s", "", t("Server to use, by name or address (default: the one chosen with hop use)"))
	pf.BoolVar(&a.jsonOut, "json", false, t("Print the answer as JSON, for scripts"))
	pf.Bool("no-color", false, t("Turn colours off"))

	root.AddGroup(
		&cobra.Group{ID: "links", Title: t("Links")},
		&cobra.Group{ID: "organize", Title: t("Organise")},
		&cobra.Group{ID: "manage", Title: t("Manage")},
		&cobra.Group{ID: "account", Title: t("Account and servers")},
		&cobra.Group{ID: "app", Title: t("This app")},
	)
	add := func(group string, cmds ...*cobra.Command) {
		for _, c := range cmds {
			c.GroupID = group
			root.AddCommand(c)
		}
	}
	add("links", a.createCmd(), a.listCmd(), a.showCmd(), a.editCmd(), a.removeCmd(), a.enableCmd(true), a.enableCmd(false),
		a.qrCmd(), a.statsCmd(), a.openCmd(), a.checkCmd(), a.historyCmd(), a.importCmd(), a.exportCmd())
	add("organize", a.domainsCmd(), a.tagsCmd(), a.foldersCmd())
	add("manage", a.settingsCmd(), a.blockedCmd(), a.usersCmd(), a.auditCmd(), a.apiCmd())
	add("account", a.loginCmd(), a.logoutCmd(), a.serversCmd(), a.useCmd(), a.whoamiCmd(), a.profileCmd())
	add("app", a.updateCmd(), a.configCmd(), a.skillCmd(), a.completionCmd(), a.versionCmd())

	root.SetHelpCommand(&cobra.Command{
		Use:    "help [command]",
		Short:  t("Explain a command"),
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			target, _, err := root.Find(args)
			if err != nil || target == nil {
				return usage(t("Unknown command: %s", strings.Join(args, " ")))
			}
			return target.Help()
		},
	})
	root.SetHelpFunc(a.help)
	root.InitDefaultHelpFlag()
	root.InitDefaultVersionFlag()
	root.Flags().Lookup("version").Usage = t("Show the version of this app")
	localize(root)
	return root
}

// localize translates what cobra adds by itself.
func localize(cmd *cobra.Command) {
	cmd.DisableFlagsInUseLine = true
	cmd.InitDefaultHelpFlag()
	if f := cmd.Flags().Lookup("help"); f != nil {
		f.Usage = t("Show this help")
	}
	for _, c := range cmd.Commands() {
		localize(c)
	}
}

// report prints an error the way a person can act on it, and picks the exit code.
func (a *app) report(err error) int {
	var f *failure
	var apiErr *api.Error
	var urlErr *url.Error
	switch {
	case errors.Is(err, ui.ErrCancelled), errors.Is(err, context.Canceled):
		ui.Info(t("Cancelled."))
		return 130
	case errors.As(err, &f):
		ui.Failure(f.msg, f.hint)
		return f.code
	case errors.As(err, &apiErr):
		msg, hint := apiMessage(apiErr)
		if a.jsonOut {
			_ = json.NewEncoder(os.Stderr).Encode(map[string]any{"error": apiErr.Code, "status": apiErr.Status, "fields": apiErr.Fields})
			return 1
		}
		ui.Failure(msg, hint)
		return 1
	case errors.As(err, &urlErr):
		host := urlErr.URL
		if u, perr := url.Parse(urlErr.URL); perr == nil {
			host = u.Host
		}
		ui.Failure(t("Could not reach %s.", host), t("Check the address and your connection, then try again."))
		return 1
	default:
		msg := err.Error()
		// What cobra says about wrong arguments.
		if strings.HasPrefix(msg, "unknown command") || strings.HasPrefix(msg, "unknown flag") || strings.HasPrefix(msg, "unknown shorthand") ||
			strings.Contains(msg, "arg(s)") || strings.HasPrefix(msg, "invalid argument") || strings.HasPrefix(msg, "flag needs an argument") || strings.HasPrefix(msg, "required flag") {
			ui.Failure(msg, t("Run `hop help` to see what hop can do."))
			return 2
		}
		ui.Failure(msg, "")
		return 1
	}
}

// server is the installation a command works with.
type server struct {
	name string
	url  string
	*api.Client
}

// connect picks the server: --server, then HOP_SERVER, then the default one.
// HOP_TOKEN (with HOP_SERVER set to an address) works without signing in, for scripts and CI.
func (a *app) connect() (*server, error) {
	ref := a.serverFlag
	if ref == "" {
		ref = os.Getenv("HOP_SERVER")
	}
	envToken := os.Getenv("HOP_TOKEN")
	if ref == "" {
		ref = a.cfg.Default
	}
	if ref == "" {
		if names := a.cfg.Names(); len(names) == 1 {
			ref = names[0]
		}
	}
	if ref == "" {
		return nil, failHint(t("You are not signed in to any server."), t("Run `hop login https://your-hop-address` first."))
	}
	name, candidates := a.cfg.Find(ref)
	if name == "" && len(candidates) > 1 {
		return nil, usageHint(t("More than one server matches “%s”.", ref), strings.Join(candidates, ", "))
	}
	if name == "" {
		if envToken != "" {
			base, err := normalizeServerURL(ref)
			if err != nil {
				return nil, err
			}
			return &server{name: hostOf(base), url: base, Client: api.New(base, envToken, a.version)}, nil
		}
		return nil, failHint(t("You are not signed in to %s.", ref), t("Run `hop login %s` first, or `hop servers` to see the ones you know.", ref))
	}
	token := envToken
	if token == "" {
		token = a.cfg.Token(name)
	}
	if token == "" {
		return nil, failHint(t("The sign-in for %s is missing.", name), t("Run `hop login %s` again.", name))
	}
	s := a.cfg.Servers[name]
	return &server{name: name, url: s.URL, Client: api.New(s.URL, token, a.version)}, nil
}

// normalizeServerURL turns what a person typed ("hop.example.com") into the address of the server.
func normalizeServerURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", usage(t("The server address is missing."))
	}
	if !strings.Contains(raw, "://") {
		scheme := "https://"
		host := strings.Split(strings.Split(raw, "/")[0], ":")[0]
		if host == "localhost" || strings.HasSuffix(host, ".localhost") || host == "127.0.0.1" {
			scheme = "http://"
		}
		raw = scheme + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", usage(t("“%s” is not a valid server address.", raw))
	}
	return u.Scheme + "://" + strings.ToLower(u.Host), nil
}

func hostOf(base string) string {
	if u, err := url.Parse(base); err == nil && u.Host != "" {
		return u.Host
	}
	return base
}

// printJSON writes a value as indented JSON on the standard output.
func printJSON(v any) error {
	if raw, ok := v.(json.RawMessage); ok {
		var pretty any
		if json.Unmarshal(raw, &pretty) == nil {
			v = pretty
		}
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}

// confirm asks before something that cannot be undone. --yes answers for the person; without a
// terminal and without --yes the command stops instead of guessing.
func (a *app) confirm(question string) error {
	if a.yes {
		return nil
	}
	if !ui.InTTY || !ui.ErrTTY {
		return usageHint(t("This needs a confirmation."), t("Add --yes to go ahead without being asked."))
	}
	ok, err := ui.Confirm(question, t("Yes"), t("No"))
	if err != nil {
		return err
	}
	if !ok {
		return ui.ErrCancelled
	}
	return nil
}

func (a *app) yesFlag(cmd *cobra.Command) {
	cmd.Flags().BoolVarP(&a.yes, "yes", "y", false, t("Don't ask for confirmation"))
}

// overview is what `hop` alone shows: who you are and what you can do.
func (a *app) overview(cmd *cobra.Command) {
	ui.Println()
	ui.Println("  " + ui.Accent.Bold(true).Render("hop") + "  " + ui.Muted.Render(t("Short links from your terminal")))
	ui.Println()
	if name := a.cfg.Default; name != "" && a.cfg.Servers[name] != nil {
		s := a.cfg.Servers[name]
		who := s.User
		if who == "" {
			who = s.Email
		}
		ui.Println("  " + ui.Good.Render("●") + " " + t("Signed in to %s as %s", ui.Bold.Render(name), who))
	} else {
		ui.Println("  " + ui.Muted.Render("○") + " " + t("Not signed in yet. Start with: %s", ui.Accent.Render("hop login https://your-hop-address")))
	}
	a.help(cmd, nil)
}

func fprintln(a ...any) { fmt.Fprintln(ui.Out, a...) }
