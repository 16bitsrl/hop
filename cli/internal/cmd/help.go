package cmd

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/16bitsrl/hop/cli/internal/ui"
)

func heading(text string) string { return ui.Muted.Bold(true).Render(strings.ToUpper(text)) }

// help draws the help of a command: what it does, how to call it, its commands, flags and examples.
func (a *app) help(cmd *cobra.Command, _ []string) {
	isRoot := cmd == a.root
	ui.Println()
	if !isRoot {
		desc := cmd.Long
		if desc == "" {
			desc = cmd.Short
		}
		if desc != "" {
			if w := min(ui.Width(), 92); w > 30 {
				desc = lipgloss.Wrap(desc, w-4, " ")
			}
			ui.Println("  " + strings.ReplaceAll(desc, "\n", "\n  "))
			ui.Println()
		}
	}
	ui.Println("  " + heading(t("Usage")))
	if isRoot {
		ui.Println("    hop " + ui.Muted.Render(t("<command> [options]")))
		ui.Println("    hop " + ui.Muted.Render(t("<address to shorten>")))
	} else {
		line := cmd.UseLine()
		if cmd.HasAvailableSubCommands() {
			ui.Println("    " + line + " " + ui.Muted.Render(t("<command> [options]")))
		}
		if cmd.Runnable() {
			ui.Println("    " + line + " " + ui.Muted.Render(t("[options]")))
		}
		if len(cmd.Aliases) > 0 {
			ui.Println("    " + ui.Muted.Render(t("Also: %s", strings.Join(cmd.Aliases, ", "))))
		}
	}

	printCommands := func(title string, cmds []*cobra.Command) {
		if len(cmds) == 0 {
			return
		}
		width := 0
		for _, c := range cmds {
			width = max(width, len(c.Name()))
		}
		ui.Println()
		ui.Println("  " + heading(title))
		for _, c := range cmds {
			ui.Println("    " + ui.Accent.Render(c.Name()) + strings.Repeat(" ", width-len(c.Name())+2) + c.Short)
		}
	}
	if groups := cmd.Groups(); len(groups) > 0 {
		for _, g := range groups {
			var cmds []*cobra.Command
			for _, c := range cmd.Commands() {
				if c.GroupID == g.ID && c.IsAvailableCommand() {
					cmds = append(cmds, c)
				}
			}
			printCommands(g.Title, cmds)
		}
	} else {
		var cmds []*cobra.Command
		for _, c := range cmd.Commands() {
			if c.IsAvailableCommand() {
				cmds = append(cmds, c)
			}
		}
		printCommands(t("Commands"), cmds)
	}

	printFlags(t("Options"), cmd.LocalFlags())
	if !isRoot {
		printFlags(t("Options for every command"), cmd.InheritedFlags())
	}
	if cmd.Example != "" {
		ui.Println()
		ui.Println("  " + heading(t("Examples")))
		for _, line := range strings.Split(cmd.Example, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "#") {
				ui.Println("    " + ui.Muted.Render(line))
			} else {
				ui.Println("    " + line)
			}
		}
	}
	ui.Println()
	if isRoot {
		ui.Println("  " + ui.Muted.Render(t("Run `hop help <command>` to learn more about a command.")))
		ui.Println()
	}
}

func printFlags(title string, flags *pflag.FlagSet) {
	type row struct{ name, usage string }
	var rows []row
	width := 0
	flags.VisitAll(func(f *pflag.Flag) {
		if f.Hidden {
			return
		}
		name := "--" + f.Name
		if f.Shorthand != "" {
			name = "-" + f.Shorthand + ", " + name
		} else {
			name = "    " + name
		}
		if kind := f.Value.Type(); kind != "bool" {
			name += " " + placeholder(f)
		}
		rows = append(rows, row{name, f.Usage})
		width = max(width, lipgloss.Width(name))
	})
	if len(rows) == 0 {
		return
	}
	ui.Println()
	ui.Println("  " + heading(title))
	wrapAt := ui.Width() - width - 8
	for _, r := range rows {
		usage := r.usage
		if wrapAt > 20 {
			usage = strings.ReplaceAll(lipgloss.Wrap(usage, wrapAt, " "), "\n", "\n"+strings.Repeat(" ", width+6))
		}
		ui.Println("    " + ui.Accent.Render(r.name) + strings.Repeat(" ", width-lipgloss.Width(r.name)+2) + usage)
	}
}

// placeholder names the value an option takes.
func placeholder(f *pflag.Flag) string {
	word := t("text")
	switch f.Name {
	case "output":
		word = t("file")
	case "domain", "host":
		word = t("domain")
	case "server":
		word = t("server")
	case "color", "background":
		word = t("colour")
	case "size", "limit", "page", "max-clicks":
		word = t("number")
	case "dir":
		word = t("folder")
	case "target":
		word = "claude|codex|gemini|agents"
	case "folder", "in":
		word = t("folder")
	case "tag", "add-tag", "remove-tag":
		word = t("tag")
	case "expires", "from", "to":
		word = t("date")
	case "url", "fallback", "root-url", "not-found-url", "preview-image", "app-url":
		word = t("address")
	case "token":
		word = t("key")
	case "rule":
		word = t("rule")
	case "variant":
		word = t("weight:address")
	case "query":
		word = t("name=value")
	case "format":
		word = "png|svg"
	case "csv":
		word = "summary|clicks"
	case "redirect":
		word = "301|302|307|308"
	case "period":
		word = "30d"
	case "tz":
		word = "Europe/Rome"
	case "method":
		word = "GET|POST|…"
	case "data":
		word = "json"
	case "sort":
		word = "created|clicks|last-click|slug"
	case "state":
		word = "active|off|expired|broken|password"
	}
	return "<" + word + ">"
}
