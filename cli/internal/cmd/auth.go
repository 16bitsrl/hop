package cmd

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"charm.land/huh/v2"
	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
	"github.com/16bitsrl/hop/cli/internal/config"
	"github.com/16bitsrl/hop/cli/internal/ui"
)

func roleName(role string) string {
	switch role {
	case "admin":
		return t("Administrator")
	case "member":
		return t("Member")
	case "viewer":
		return t("Viewer")
	}
	return role
}

func (a *app) loginCmd() *cobra.Command {
	var token, deviceName string
	var tokenFromStdin, noBrowser bool
	cmd := &cobra.Command{
		Use:   "login [server]",
		Short: t("Sign in to a hop server"),
		Long: t("Sign in to a hop server.") + "\n\n" +
			t("Your browser opens on a page where you confirm the sign-in: it works with passwords, passkeys and single sign-on. You can sign in to as many servers as you like; the last one becomes the default."),
		Example: "hop login https://hop.example.com\n" +
			"# " + t("With an API key created in your profile (for scripts and CI)") + "\n" +
			"hop login hop.example.com --token hop_…\n" +
			"echo $KEY | hop login hop.example.com --with-token",
		Args: maxArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			address := ""
			if len(args) == 1 {
				address = args[0]
			} else if ui.InTTY && ui.ErrTTY {
				err := ui.RunForm(huh.NewInput().Title(t("Address of your hop server")).Placeholder("https://hop.example.com").Value(&address).
					Validate(func(s string) error {
						_, err := normalizeServerURL(s)
						return err
					}))
				if err != nil {
					return err
				}
			} else {
				return usage(t("Which server? Add its address: hop login https://hop.example.com"))
			}
			base, err := normalizeServerURL(address)
			if err != nil {
				return err
			}
			name := hostOf(base)
			client := api.New(base, "", a.version)

			var status struct {
				OK bool `json:"ok"`
			}
			if err := client.Get(ctx, "/api/status", nil, &status); err != nil || !status.OK {
				var apiErr *api.Error
				if err == nil || errors.As(err, &apiErr) {
					return failHint(t("%s doesn't look like a hop server.", name), t("Use the address of the hop app (the one you open in the browser), not a short domain."))
				}
				return err
			}

			if tokenFromStdin {
				line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
				token = strings.TrimSpace(line)
				if token == "" {
					return usage(t("No key arrived on the standard input."))
				}
			}
			ownKey := false
			if token == "" {
				token, err = a.browserLogin(ctx, client, deviceName, noBrowser)
				if err != nil {
					return err
				}
				ownKey = true
			}
			client.Token = token
			user, err := whoAmI(ctx, client)
			if err != nil {
				return err
			}
			if user == nil {
				return failHint(t("The server did not accept this key."), t("Check that you copied it whole and that it was not revoked."))
			}
			// Signing in again replaces the key this app made before: the old one is revoked, not left behind.
			if old := a.cfg.Servers[name]; old != nil && old.OwnKey {
				if oldToken := a.cfg.Token(name); oldToken != "" && oldToken != token {
					revokeKey(ctx, base, oldToken, a.version)
				}
			}
			a.cfg.Servers[name] = &config.Server{URL: base, User: user.Name, Email: user.Email, Role: user.Role, OwnKey: ownKey}
			a.cfg.SetToken(name, token)
			a.cfg.Default = name
			if err := a.cfg.Save(); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(map[string]any{"server": name, "url": base, "user": user})
			}
			ui.Success(t("Signed in to %s as %s (%s).", ui.Bold.Render(name), user.Name, strings.ToLower(roleName(user.Role))))
			if len(a.cfg.Servers) > 1 {
				ui.Hint(t("It is now the default server. Switch with `hop use <server>`."))
			} else {
				ui.Hint(t("Try: %s", "hop create https://example.com/a-long-address"))
			}
			return nil
		},
	}
	f := cmd.Flags()
	f.StringVar(&token, "token", "", t("Sign in with this API key instead of the browser"))
	f.BoolVar(&tokenFromStdin, "with-token", false, t("Read the API key from the standard input"))
	f.BoolVar(&noBrowser, "no-browser", false, t("Don't open the browser, only show the address to visit"))
	f.StringVar(&deviceName, "name", "", t("How this computer is called in your list of keys (default: its name on the network)"))
	return cmd
}

func whoAmI(ctx context.Context, c *api.Client) (*api.User, error) {
	var me struct {
		User *api.User `json:"user"`
	}
	if err := c.Get(ctx, "/api/me", nil, &me); err != nil {
		return nil, err
	}
	return me.User, nil
}

func defaultDeviceName() string {
	host, _ := os.Hostname()
	host = strings.TrimSuffix(host, ".local")
	if host == "" {
		return "hop CLI"
	}
	name := "hop CLI (" + host + ")"
	if len(name) > 60 {
		name = name[:60]
	}
	return name
}

// browserLogin makes a key, asks the server to accept it and waits while the person confirms in the
// browser. Only the hash of the key leaves this computer until the key is used.
func (a *app) browserLogin(ctx context.Context, client *api.Client, deviceName string, noBrowser bool) (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	secret := "hop_" + base64.RawURLEncoding.EncodeToString(random)
	sum := sha256.Sum256([]byte(secret))
	keyHash := hex.EncodeToString(sum[:])
	if deviceName == "" {
		deviceName = defaultDeviceName()
	}

	var started struct {
		Code      string `json:"code"`
		VerifyURL string `json:"verifyUrl"`
		ExpiresIn int    `json:"expiresIn"`
		Interval  int    `json:"interval"`
	}
	err := client.Do(ctx, http.MethodPost, "/api/cli/login", nil, map[string]string{"name": deviceName, "keyHash": keyHash, "prefix": secret[:8]}, &started)
	var apiErr *api.Error
	if errors.As(err, &apiErr) && (apiErr.Status == 404 || apiErr.Status == 405) {
		return "", failHint(t("This server is too old to sign in from the browser."), t("Update the server, or create an API key in your profile there and run `hop login %s --token <key>`.", client.BaseURL))
	}
	if err != nil {
		return "", err
	}

	ui.Eprintln()
	for _, line := range strings.Split(ui.Box(ui.Muted.Render(t("Your code"))+"   "+ui.Bold.Render(started.Code)), "\n") {
		ui.Eprintln("  " + line)
	}
	ui.Eprintln()
	opened := !noBrowser && os.Getenv("HOP_NO_BROWSER") == "" && openBrowser(started.VerifyURL) == nil
	if opened {
		ui.Eprintln("  " + t("Your browser is opening. Check that the page shows the same code, then confirm."))
		ui.Eprintln("  " + ui.Muted.Render(t("If nothing opens, visit: %s", started.VerifyURL)))
	} else {
		ui.Eprintln("  " + t("Open this address in a browser and confirm: %s", ui.Link.Render(started.VerifyURL)))
	}
	ui.Eprintln()

	interval := time.Duration(max(started.Interval, 1)) * time.Second
	deadline := time.Now().Add(time.Duration(max(started.ExpiresIn, 60)) * time.Second)
	status := ""
	err = ui.Spin(ctx, t("Waiting for you to confirm in the browser…"), func(ctx context.Context) error {
		for time.Now().Before(deadline) {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(interval):
			}
			var polled struct {
				Status string `json:"status"`
			}
			if err := client.Do(ctx, http.MethodPost, "/api/cli/login/poll", nil, map[string]string{"keyHash": keyHash}, &polled); err != nil {
				if errors.As(err, &apiErr) {
					return err
				}
				continue // a hiccup of the network: keep waiting
			}
			if polled.Status != "pending" {
				status = polled.Status
				return nil
			}
		}
		status = "expired"
		return nil
	})
	if err != nil {
		return "", err
	}
	switch status {
	case "approved":
		return secret, nil
	case "denied":
		return "", fail(t("The sign-in was refused in the browser."))
	default:
		return "", failHint(t("The code expired before it was confirmed."), t("Run `hop login` again to get a new one."))
	}
}

func openBrowser(address string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", address).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", address).Start()
	default:
		if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
			return errors.New("no display")
		}
		return exec.Command("xdg-open", address).Start()
	}
}

// revokeKey asks the server to revoke the key it is called with. Best effort: the key may be gone
// already, or the server unreachable.
func revokeKey(ctx context.Context, base, token, version string) bool {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return api.New(base, token, version).Do(ctx, http.MethodPost, "/api/cli/logout", nil, map[string]string{}, nil) == nil
}

func (a *app) logoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logout [server]",
		Short: t("Sign out of a server"),
		Long:  t("Sign out of a server: the key this app got when you signed in stops working and is removed from this computer."),
		Args:  maxArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 1 {
				a.serverFlag = args[0]
			}
			ref := a.serverFlag
			if ref == "" {
				ref = a.cfg.Default
			}
			name, candidates := a.cfg.Find(ref)
			if name == "" || ref == "" {
				if len(candidates) > 1 {
					return usageHint(t("More than one server matches “%s”.", ref), strings.Join(candidates, ", "))
				}
				return fail(t("You are not signed in to any server."))
			}
			revoked := false
			if token := a.cfg.Token(name); token != "" && a.cfg.Servers[name].OwnKey {
				revoked = revokeKey(cmd.Context(), a.cfg.Servers[name].URL, token, a.version)
			}
			ownKey := a.cfg.Servers[name].OwnKey
			a.cfg.Remove(name)
			if err := a.cfg.Save(); err != nil {
				return err
			}
			ui.Success(t("Signed out of %s.", ui.Bold.Render(name)))
			switch {
			case !ownKey:
				ui.Hint(t("The API key you signed in with still works elsewhere: revoke it in your profile if you no longer need it."))
			case !revoked:
				ui.Hint(t("The server could not be reached to revoke the key: you can do it in your profile."))
			}
			if a.cfg.Default != "" {
				ui.Hint(t("The default server is now %s.", a.cfg.Default))
			}
			return nil
		},
	}
}

func (a *app) serversCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "servers",
		Aliases: []string{"server"},
		Short:   t("List the servers you are signed in to"),
		Args:    noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			names := a.cfg.Names()
			if a.jsonOut {
				type row struct {
					Name    string `json:"name"`
					URL     string `json:"url"`
					User    string `json:"user"`
					Email   string `json:"email"`
					Role    string `json:"role"`
					Default bool   `json:"default"`
				}
				rows := []row{}
				for _, n := range names {
					s := a.cfg.Servers[n]
					rows = append(rows, row{n, s.URL, s.User, s.Email, s.Role, n == a.cfg.Default})
				}
				return printJSON(rows)
			}
			if len(names) == 0 {
				ui.Info(t("You are not signed in to any server."))
				ui.Hint(t("Run `hop login https://your-hop-address` first."))
				return nil
			}
			table := ui.Table{Headers: []string{"", t("Server"), t("Address"), t("Person"), t("Role")}, Flex: 2}
			for _, n := range names {
				s := a.cfg.Servers[n]
				mark := " "
				if n == a.cfg.Default {
					mark = ui.Good.Render("●")
				}
				if !ui.OutTTY && n == a.cfg.Default {
					mark = "*"
				}
				table.Rows = append(table.Rows, []string{mark, n, s.URL, s.User, roleName(s.Role)})
			}
			table.Print()
			if len(names) > 1 && ui.OutTTY {
				ui.Println()
				ui.Println("  " + ui.Muted.Render(t("● is the default. Change it with `hop use <server>`, or pick one for a single command with --server.")))
			}
			return nil
		},
	}
}

func (a *app) useCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "use <server>",
		Short: t("Choose the default server"),
		Args:  exactArgs(1),
		ValidArgsFunction: func(*cobra.Command, []string, string) ([]string, cobra.ShellCompDirective) {
			return a.cfg.Names(), cobra.ShellCompDirectiveNoFileComp
		},
		RunE: func(_ *cobra.Command, args []string) error {
			name, candidates := a.cfg.Find(args[0])
			if name == "" {
				if len(candidates) > 1 {
					return usageHint(t("More than one server matches “%s”.", args[0]), strings.Join(candidates, ", "))
				}
				return failHint(t("You are not signed in to %s.", args[0]), t("Run `hop login %s` first, or `hop servers` to see the ones you know.", args[0]))
			}
			a.cfg.Default = name
			if err := a.cfg.Save(); err != nil {
				return err
			}
			ui.Success(t("The default server is now %s.", ui.Bold.Render(name)))
			return nil
		},
	}
}

func (a *app) whoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: t("Show who you are on the server"),
		Args:  noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			user, err := whoAmI(cmd.Context(), srv.Client)
			if err != nil {
				return err
			}
			if user == nil {
				return failHint(t("Your sign-in is not valid anymore."), t("Run `hop login` again."))
			}
			if s := a.cfg.Servers[srv.name]; s != nil && (s.User != user.Name || s.Role != user.Role || s.Email != user.Email) {
				s.User, s.Email, s.Role = user.Name, user.Email, user.Role
				_ = a.cfg.Save()
			}
			if a.jsonOut {
				return printJSON(map[string]any{"server": srv.name, "url": srv.url, "user": user})
			}
			ui.Fields([]ui.Field{
				{Label: t("Server"), Value: ui.Bold.Render(srv.name) + "  " + ui.Muted.Render(srv.url)},
				{Label: t("Person"), Value: user.Name},
				{Label: t("Email"), Value: user.Email},
				{Label: t("Role"), Value: roleName(user.Role)},
			})
			return nil
		},
	}
}
