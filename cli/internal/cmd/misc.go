package cmd

import (
	"context"
	"errors"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/config"
	"github.com/16bitsrl/hop/cli/internal/i18n"
	"github.com/16bitsrl/hop/cli/internal/ui"
	"github.com/16bitsrl/hop/cli/internal/update"
)

// noteLatest records the newest version just seen, keeping the rest of what the app remembers.
func (a *app) noteLatest(version string) {
	state := a.cfg.LoadState()
	state.UpdateCheckedAt, state.LatestVersion = time.Now(), version
	_ = a.cfg.SaveState(state)
}

func errorsAs(err error, target any) bool { return errors.As(err, target) }

/* ------------------------------ update ------------------------------ */

// installUpdate replaces the program with the newest release and says so.
func (a *app) installUpdate(ctx context.Context) error {
	var rel *update.Release
	err := ui.Spin(ctx, t("Looking for a new version…"), func(ctx context.Context) (err error) {
		rel, err = update.Latest(ctx)
		return err
	})
	if err != nil {
		return err
	}
	if !update.Newer(rel.Version, a.version) {
		return nil
	}
	err = ui.Spin(ctx, t("Installing hop %s…", rel.Version), func(ctx context.Context) error { return update.Apply(ctx, rel) })
	if err != nil {
		return err
	}
	a.noteLatest(rel.Version)
	ui.Success(t("hop is now at version %s (it was %s).", ui.Bold.Render(rel.Version), a.version))
	return nil
}

func (a *app) updateCmd() *cobra.Command {
	var checkOnly bool
	cmd := &cobra.Command{
		Use:     "update",
		Aliases: []string{"upgrade"},
		Short:   t("Get the newest version of this app"),
		Long: t("Get the newest version of this app.") + "\n\n" +
			t("hop also looks for new versions by itself, once a day, and tells you. To have them installed without asking: hop config set updates auto. To never look: hop config set updates off."),
		Args: noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			var rel *update.Release
			err := ui.Spin(ctx, t("Looking for a new version…"), func(ctx context.Context) (err error) {
				rel, err = update.Latest(ctx)
				return err
			})
			if errors.Is(err, update.ErrNoRelease) {
				ui.Info(t("No version has been published for this system yet (%s).", runtime.GOOS+"/"+runtime.GOARCH))
				return nil
			}
			if err != nil {
				return failHint(t("Could not look for a new version."), err.Error())
			}
			a.noteLatest(rel.Version)
			newer := update.Newer(rel.Version, a.version)
			if a.jsonOut {
				return printJSON(map[string]any{"current": a.version, "latest": rel.Version, "updateAvailable": newer})
			}
			if a.version == "dev" {
				ui.Info(t("This is a development build; the newest published version is %s.", rel.Version))
				return nil
			}
			if !newer {
				ui.Success(t("hop is up to date (%s).", a.version))
				return nil
			}
			if checkOnly {
				ui.Info(t("hop %s is available (you have %s).", ui.Bold.Render(rel.Version), a.version) + " " + t("Run %s to get it.", ui.Accent.Render("hop update")))
				return nil
			}
			err = ui.Spin(ctx, t("Installing hop %s…", rel.Version), func(ctx context.Context) error { return update.Apply(ctx, rel) })
			if err != nil {
				if errors.Is(err, os.ErrPermission) {
					exe, _ := os.Executable()
					return failHint(t("hop is installed where you can't write (%s).", exe), t("Run the install command again, or update with the tool you installed hop with."))
				}
				return failHint(t("The update could not be installed."), err.Error())
			}
			ui.Success(t("hop is now at version %s (it was %s).", ui.Bold.Render(rel.Version), a.version))
			return nil
		},
	}
	cmd.Flags().BoolVar(&checkOnly, "check", false, t("Only tell whether there is a new version"))
	return cmd
}

/* ------------------------------ config ------------------------------ */

func (a *app) configCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: t("See and change how this app behaves"),
		Args:  noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			language := a.cfg.Language
			if a.jsonOut {
				return printJSON(map[string]any{"updates": a.updatesMode(), "language": language, "file": a.cfg.Path(), "version": a.version})
			}
			if language == "" {
				language = t("the system's (%s)", i18n.Lang())
			}
			var updates string
			switch a.updatesMode() {
			case "auto":
				updates = "auto  " + ui.Muted.Render(t("new versions are installed by themselves"))
			case "off":
				updates = "off  " + ui.Muted.Render(t("hop never looks for new versions"))
			default:
				updates = "notify  " + ui.Muted.Render(t("hop tells you when there is a new version"))
			}
			key := func(name string) string { return ui.Accent.Render(name) }
			ui.Println()
			ui.Fields([]ui.Field{
				{Label: key("updates"), Value: updates},
				{Label: key("language"), Value: language},
				{Label: t("Version"), Value: a.version},
				{Label: t("Settings file"), Value: ui.Muted.Render(a.cfg.Path())},
			})
			ui.Println()
			ui.Println("  " + ui.Muted.Render(t("Change a value with `hop config set <name> <value>`.")))
			ui.Println()
			return nil
		},
	}
	cmd.AddCommand(&cobra.Command{
		Use:   "set <name> <value>",
		Short: t("Change a preference"),
		Long: t("Change a preference of this app. Names:") + "\n" +
			"  updates   " + t("notify (tell me), auto (install by themselves) or off") + "\n" +
			"  language  " + t("en, it, or auto to follow the system"),
		Example: "hop config set updates auto\nhop config set language it",
		Args:    exactArgs(2),
		RunE: func(_ *cobra.Command, args []string) error {
			value := strings.ToLower(strings.TrimSpace(args[1]))
			var change func(c *config.Config)
			switch strings.ToLower(args[0]) {
			case "updates":
				switch value {
				case "notify", "auto", "off":
					change = func(c *config.Config) { c.Updates = value }
				default:
					return usage(t("updates can be notify, auto or off."))
				}
			case "language":
				switch {
				case value == "auto" || value == "system":
					change = func(c *config.Config) { c.Language = "" }
				case value == "en" || value == "it":
					change = func(c *config.Config) { c.Language = value }
				default:
					return usage(t("The language can be en, it or auto."))
				}
			default:
				return usage(t("You can change: updates, language."))
			}
			cfg, err := config.Update(func(c *config.Config) error {
				change(c)
				return nil
			})
			if err != nil {
				return err
			}
			a.cfg = cfg
			i18n.Init(a.cfg.Language)
			ui.Success(t("Saved %s", ui.Bold.Render(strings.ToLower(args[0]))))
			return nil
		},
	})
	return cmd
}

/* ------------------------------ completion, version ------------------------------ */

func (a *app) completionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "completion <bash|zsh|fish|powershell>",
		Short: t("Set up Tab completion for your shell"),
		Long: t("Print the script that completes hop commands when you press Tab.") + "\n\n" +
			"  bash        echo 'source <(hop completion bash)' >> ~/.bashrc\n" +
			"  zsh         echo 'source <(hop completion zsh)' >> ~/.zshrc\n" +
			"  fish        hop completion fish > ~/.config/fish/completions/hop.fish\n" +
			"  powershell  hop completion powershell >> $PROFILE",
		ValidArgs: []string{"bash", "zsh", "fish", "powershell"},
		Args:      exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			switch args[0] {
			case "bash":
				return a.root.GenBashCompletionV2(os.Stdout, true)
			case "zsh":
				return a.root.GenZshCompletion(os.Stdout)
			case "fish":
				return a.root.GenFishCompletion(os.Stdout, true)
			case "powershell":
				return a.root.GenPowerShellCompletionWithDesc(os.Stdout)
			}
			return usage(t("Shells: bash, zsh, fish, powershell."))
		},
	}
}

func (a *app) versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: t("Show the version of this app"),
		Args:  noArgs,
		RunE: func(*cobra.Command, []string) error {
			if a.jsonOut {
				return printJSON(map[string]any{"version": a.version, "os": runtime.GOOS, "arch": runtime.GOARCH})
			}
			ui.Println("hop " + a.version + " (" + runtime.GOOS + "/" + runtime.GOARCH + ")")
			return nil
		},
	}
}
