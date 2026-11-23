package cmd

import (
	"context"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/config"
	"github.com/16bitsrl/hop/cli/internal/ui"
	"github.com/16bitsrl/hop/cli/internal/update"
)

const updateCheckEvery = 24 * time.Hour

// updateWatch is a look for a new release running beside the command.
type updateWatch struct {
	done chan *update.Release
}

// updatesMode is "notify", "auto" or "off".
func (a *app) updatesMode() string {
	switch a.cfg.Updates {
	case "auto", "off":
		return a.cfg.Updates
	}
	return "notify"
}

// quietCommand: commands whose output is read by programs, or that deal with updates themselves.
func quietCommand(cmd *cobra.Command) bool {
	for c := cmd; c != nil; c = c.Parent() {
		switch c.Name() {
		case "update", "completion", "version", "__complete", "__completeNoDesc", "api":
			return true
		}
	}
	return false
}

func checkDue(state config.State, now time.Time) bool {
	return state.UpdateCheckedAt.IsZero() || now.Sub(state.UpdateCheckedAt) >= updateCheckEvery
}

// startUpdateCheck looks for a new release in the background, at most once a day, and only when a
// person is watching: scripts and CI are never slowed down or surprised.
func (a *app) startUpdateCheck(cmd *cobra.Command) {
	if a.version == "dev" || a.updatesMode() == "off" || os.Getenv("HOP_NO_UPDATE_CHECK") != "" || os.Getenv("CI") != "" {
		return
	}
	if !ui.ErrTTY || a.jsonOut || quietCommand(cmd) {
		return
	}
	a.updates = &updateWatch{}
	if !checkDue(a.cfg.LoadState(), time.Now()) {
		return
	}
	a.updates.done = make(chan *update.Release, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		rel, _ := update.Latest(ctx)
		a.updates.done <- rel
	}()
}

// finishUpdateCheck runs after a successful command: it notes what the check found, then tells
// about a newer version or, when the person chose automatic updates, installs it.
func (a *app) finishUpdateCheck(ctx context.Context) {
	if a.updates == nil {
		return
	}
	state := a.cfg.LoadState()
	if a.updates.done != nil {
		select {
		case rel := <-a.updates.done:
			state.UpdateCheckedAt = time.Now()
			if rel != nil {
				state.LatestVersion = rel.Version
			}
			_ = a.cfg.SaveState(state)
		case <-time.After(1500 * time.Millisecond):
			return
		}
	}
	if !update.Newer(state.LatestVersion, a.version) {
		return
	}
	if a.updatesMode() == "auto" {
		ui.Println()
		if err := a.installUpdate(ctx); err != nil {
			ui.Warning(t("hop %s is available, but it could not be installed by itself.", state.LatestVersion))
			ui.Hint(t("Run `hop update` to see why."))
		}
		return
	}
	if a.updates.done == nil {
		return // told once a day, when the check runs: not at every command
	}
	ui.Println()
	ui.Info(t("hop %s is available (you have %s).", ui.Bold.Render(state.LatestVersion), a.version) + " " + t("Run %s to get it.", ui.Accent.Render("hop update")))
}
