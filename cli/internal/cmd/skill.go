package cmd

import (
	_ "embed"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/ui"
)

// skillDoc is the Agent Skill: what an AI agent reads to learn how to use hop.
//
//go:embed skill.md
var skillDoc string

// skillTargets are the agents whose skills live in ~/.<name>/skills/<skill>/SKILL.md (or the same
// path inside a project). "agents" is the folder several tools share.
var skillTargets = []string{"claude", "codex", "gemini", "agents"}

func skillDir(base, target string) string {
	return filepath.Join(base, "."+target, "skills", "hop")
}

// looksLikeHopSkill guards the refresh: only a file this app wrote is ever replaced.
func looksLikeHopSkill(content string) bool {
	return strings.HasPrefix(content, "---\nname: hop\n") && strings.Contains(content, "# hop CLI")
}

// refreshSkills brings the copies of the skill already installed up to date with this version of
// the app, so that after `hop update` agents read about the commands that exist now. It is silent
// and touches nothing that is not this app's own skill.
func refreshSkills() {
	if os.Getenv("HOP_NO_SKILL_AUTOUPDATE") != "" {
		return
	}
	bases := []string{"."}
	if home, err := os.UserHomeDir(); err == nil {
		bases = append(bases, home)
	}
	for _, base := range bases {
		for _, target := range skillTargets {
			path := filepath.Join(skillDir(base, target), "SKILL.md")
			current, err := os.ReadFile(path)
			if err != nil || string(current) == skillDoc || !looksLikeHopSkill(string(current)) {
				continue
			}
			_ = os.WriteFile(path, []byte(skillDoc), 0o644)
		}
	}
}

func (a *app) skillCmd() *cobra.Command {
	var target, dir string
	var project, all, show bool
	cmd := &cobra.Command{
		Use:   "skill",
		Short: t("Teach AI agents how to use hop"),
		Long: t("Write the Agent Skill of hop (a SKILL.md file) where AI agents such as Claude Code, Codex and Gemini look for it, so they know how to use this app.") + "\n\n" +
			t("Once written, the file keeps itself current: every time hop runs it brings the copies it finds up to date with the installed version. Set HOP_NO_SKILL_AUTOUPDATE to turn that off."),
		Example: "hop skill\nhop skill --all\nhop skill --target codex --project\nhop skill --print",
		Args:    noArgs,
		RunE: func(*cobra.Command, []string) error {
			if show {
				_, err := os.Stdout.WriteString(skillDoc)
				return err
			}
			base := "."
			if !project {
				home, err := os.UserHomeDir()
				if err != nil {
					return err
				}
				base = home
			}
			var dirs []string
			switch {
			case dir != "":
				dirs = []string{dir}
			case all:
				for _, name := range skillTargets {
					dirs = append(dirs, skillDir(base, name))
				}
			default:
				if target == "" || strings.ContainsAny(target, `/\.`) {
					return usage(t("“%s” is not the name of an agent. Try claude, codex, gemini or agents.", target))
				}
				dirs = []string{skillDir(base, target)}
			}
			written := []string{}
			for _, d := range dirs {
				path := filepath.Join(d, "SKILL.md")
				if err := os.MkdirAll(d, 0o755); err != nil {
					return fail(t("The file could not be written: %s", err.Error()))
				}
				if err := os.WriteFile(path, []byte(skillDoc), 0o644); err != nil {
					return fail(t("The file could not be written: %s", err.Error()))
				}
				written = append(written, path)
				if !a.jsonOut {
					ui.Success(t("Skill written to %s", path))
				}
			}
			if a.jsonOut {
				return printJSON(map[string]any{"written": written})
			}
			ui.Hint(t("It keeps itself current when hop is updated."))
			return nil
		},
	}
	f := cmd.Flags()
	f.StringVar(&target, "target", "claude", t("Which agent: claude, codex, gemini, or agents for the folder several tools share"))
	f.BoolVar(&all, "all", false, t("Write it for every known agent"))
	f.BoolVar(&project, "project", false, t("Write it in the current project instead of your home folder"))
	f.StringVar(&dir, "dir", "", t("Write SKILL.md in this folder instead"))
	f.BoolVar(&show, "print", false, t("Print the skill instead of writing it"))
	return cmd
}
