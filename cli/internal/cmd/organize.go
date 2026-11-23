package cmd

import (
	"net/http"
	"sort"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
	"github.com/16bitsrl/hop/cli/internal/ui"
)

// parent makes a command that lists when called alone and has sub-commands for the rest.
func parent(use, short string, aliases []string, list func(cmd *cobra.Command) error, subs ...*cobra.Command) *cobra.Command {
	cmd := &cobra.Command{
		Use:     use,
		Short:   short,
		Aliases: aliases,
		Args:    noArgs,
		RunE:    func(cmd *cobra.Command, _ []string) error { return list(cmd) },
	}
	cmd.AddCommand(&cobra.Command{Use: "list", Aliases: []string{"ls"}, Short: t("Show the list"), Args: noArgs, RunE: func(cmd *cobra.Command, _ []string) error { return list(cmd) }})
	cmd.AddCommand(subs...)
	return cmd
}

/* ------------------------------ domains ------------------------------ */

func (a *app) domainsCmd() *cobra.Command {
	list := func(cmd *cobra.Command) error {
		srv, err := a.connect()
		if err != nil {
			return err
		}
		domains, err := srv.domains(cmd.Context())
		if err != nil {
			return err
		}
		if a.jsonOut {
			return printJSON(map[string]any{"domains": domains})
		}
		if len(domains) == 0 {
			ui.Info(t("No short domains yet."))
			ui.Hint(t("An administrator can do it with `hop domains add go.example.com`."))
			return nil
		}
		table := ui.Table{Headers: []string{t("Domain"), t("Links"), t("Default"), t("Bare domain goes to"), t("Unknown endings go to")}, Right: []int{1}, Flex: 3}
		for _, d := range domains {
			def := ""
			if d.IsDefault {
				def = ui.Good.Render(t("yes"))
			}
			table.Rows = append(table.Rows, []string{ui.Accent.Render(d.Host), ui.Number(d.LinkCount), def, deref(d.RootURL), deref(d.NotFoundURL)})
		}
		table.Print()
		return nil
	}

	var makeDefault bool
	var rootURL, notFoundURL, host string
	body := func(cmd *cobra.Command) map[string]any {
		b := map[string]any{}
		if cmd.Flags().Changed("default") && makeDefault {
			b["isDefault"] = true
		}
		if cmd.Flags().Changed("root-url") {
			b["rootUrl"] = rootURL
		}
		if cmd.Flags().Changed("not-found-url") {
			b["notFoundUrl"] = notFoundURL
		}
		if cmd.Flags().Changed("host") {
			b["host"] = host
		}
		return b
	}
	bind := func(cmd *cobra.Command) {
		cmd.Flags().BoolVar(&makeDefault, "default", false, t("Make it the default domain for new links"))
		cmd.Flags().StringVar(&rootURL, "root-url", "", t("Address visitors reach when they open the bare domain"))
		cmd.Flags().StringVar(&notFoundURL, "not-found-url", "", t("Address visitors reach when the ending does not exist"))
	}

	add := &cobra.Command{
		Use:     "add <domain>",
		Short:   t("Add a short domain"),
		Long:    t("Add a short domain. Point the domain at your hop server first, where your server is hosted."),
		Example: "hop domains add go.example.com --default",
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			b := body(cmd)
			b["host"] = args[0]
			var out struct {
				Domain api.Domain `json:"domain"`
			}
			if err := srv.Do(cmd.Context(), http.MethodPost, "/api/domains", nil, b, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Added %s", ui.Bold.Render(out.Domain.Host)))
			return nil
		},
	}
	bind(add)

	edit := &cobra.Command{
		Use:     "edit <domain>",
		Short:   t("Change a short domain"),
		Example: "hop domains edit go.example.com --default\nhop domains edit go.example.com --not-found-url https://example.com/",
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			id, err := srv.domainID(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			b := body(cmd)
			if len(b) == 0 {
				return usage(t("Nothing to change: name what to change."))
			}
			var out jsonRaw
			if err := srv.Do(cmd.Context(), http.MethodPatch, "/api/domains/"+id, nil, b, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Saved %s", ui.Bold.Render(args[0])))
			return nil
		},
	}
	bind(edit)
	edit.Flags().StringVar(&host, "host", "", t("Rename the domain to this host"))

	rm := &cobra.Command{
		Use:     "rm <domain>",
		Aliases: []string{"delete", "remove"},
		Short:   t("Remove a short domain that has no links"),
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			id, err := srv.domainID(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			if err := a.confirm(t("Remove the domain %s?", args[0])); err != nil {
				return err
			}
			if err := srv.Do(cmd.Context(), http.MethodDelete, "/api/domains/"+id, nil, nil, nil); err != nil {
				return err
			}
			ui.Success(t("Removed %s", args[0]))
			return nil
		},
	}
	a.yesFlag(rm)
	return parent("domains", t("See and manage short domains"), []string{"domain"}, list, add, edit, rm)
}

/* ------------------------------ tags ------------------------------ */

func (a *app) tagsCmd() *cobra.Command {
	list := func(cmd *cobra.Command) error {
		srv, err := a.connect()
		if err != nil {
			return err
		}
		tags, err := srv.tags(cmd.Context())
		if err != nil {
			return err
		}
		if a.jsonOut {
			return printJSON(map[string]any{"tags": tags})
		}
		if len(tags) == 0 {
			ui.Info(t("No tags yet. A tag is created the first time you use it: hop create <address> --tag promo"))
			return nil
		}
		table := ui.Table{Headers: []string{"", t("Tag"), t("Links")}, Right: []int{2}, Flex: -1}
		for _, tag := range tags {
			dot := "●"
			if tag.Color != nil && hexColor.MatchString(*tag.Color) {
				dot = lipgloss.NewStyle().Foreground(lipgloss.Color(*tag.Color)).Render("●")
			}
			table.Rows = append(table.Rows, []string{dot, tag.Name, ui.Number(tag.LinkCount)})
		}
		table.Print()
		return nil
	}

	var name, tagColor string
	add := &cobra.Command{
		Use:   "add <name>",
		Short: t("Create a tag"),
		Args:  exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			b := map[string]any{"name": args[0]}
			if tagColor != "" {
				_, hex, err := parseColor(tagColor)
				if err != nil {
					return err
				}
				b["color"] = hex
			}
			var out jsonRaw
			if err := srv.Do(cmd.Context(), http.MethodPost, "/api/tags", nil, b, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Created the tag %s", ui.Bold.Render(args[0])))
			return nil
		},
	}
	add.Flags().StringVar(&tagColor, "color", "", t("Colour of the tag, like #3b82f6"))

	edit := &cobra.Command{
		Use:   "edit <tag>",
		Short: t("Rename a tag or change its colour"),
		Args:  exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			tag, err := srv.tagByName(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			b := map[string]any{}
			if name != "" {
				b["name"] = name
			}
			if tagColor != "" {
				_, hex, err := parseColor(tagColor)
				if err != nil {
					return err
				}
				b["color"] = hex
			}
			if len(b) == 0 {
				return usage(t("Nothing to change: name what to change."))
			}
			var out jsonRaw
			if err := srv.Do(cmd.Context(), http.MethodPatch, "/api/tags/"+tag.ID, nil, b, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Saved the tag %s", ui.Bold.Render(tag.Name)))
			return nil
		},
	}
	edit.Flags().StringVar(&name, "name", "", t("New name"))
	edit.Flags().StringVar(&tagColor, "color", "", t("Colour of the tag, like #3b82f6"))

	rm := &cobra.Command{
		Use:     "rm <tag>",
		Aliases: []string{"delete", "remove"},
		Short:   t("Delete a tag (its links stay)"),
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			tag, err := srv.tagByName(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			if err := a.confirm(t("Delete the tag %s? Its links stay.", tag.Name)); err != nil {
				return err
			}
			if err := srv.Do(cmd.Context(), http.MethodDelete, "/api/tags/"+tag.ID, nil, nil, nil); err != nil {
				return err
			}
			ui.Success(t("Deleted the tag %s", tag.Name))
			return nil
		},
	}
	a.yesFlag(rm)
	return parent("tags", t("See and manage tags"), []string{"tag"}, list, add, edit, rm)
}

/* ------------------------------ folders ------------------------------ */

func (a *app) foldersCmd() *cobra.Command {
	list := func(cmd *cobra.Command) error {
		srv, err := a.connect()
		if err != nil {
			return err
		}
		folders, err := srv.folders(cmd.Context())
		if err != nil {
			return err
		}
		if a.jsonOut {
			return printJSON(map[string]any{"folders": folders})
		}
		if len(folders) == 0 {
			ui.Info(t("No folders yet."))
			ui.Hint(t("Create one: %s", "hop folders add Campaigns"))
			return nil
		}
		children := map[string][]api.Folder{}
		for _, f := range folders {
			children[deref(f.ParentID)] = append(children[deref(f.ParentID)], f)
		}
		for _, list := range children {
			sort.Slice(list, func(i, j int) bool { return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name) })
		}
		var walk func(parentID, prefix string)
		walk = func(parentID, prefix string) {
			list := children[parentID]
			for i, f := range list {
				branch, next := "├─ ", "│  "
				if i == len(list)-1 {
					branch, next = "└─ ", "   "
				}
				if !ui.OutTTY {
					ui.Println(folderPath(folders, f.ID) + "\t" + ui.Number(f.LinkCount))
				} else {
					ui.Println("  " + ui.Muted.Render(prefix+branch) + f.Name + "  " + ui.Muted.Render(ui.Number(f.LinkCount)))
				}
				walk(f.ID, prefix+next)
			}
		}
		walk("", "")
		return nil
	}

	var parentRef, name string
	add := &cobra.Command{
		Use:     "add <name>",
		Short:   t("Create a folder"),
		Example: "hop folders add Campaigns\nhop folders add 2026 --in Campaigns",
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			b := map[string]any{"name": args[0]}
			if parentRef != "" {
				if b["parentId"], err = srv.folderID(cmd.Context(), parentRef); err != nil {
					return err
				}
			}
			var out jsonRaw
			if err := srv.Do(cmd.Context(), http.MethodPost, "/api/folders", nil, b, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Created the folder %s", ui.Bold.Render(args[0])))
			return nil
		},
	}
	add.Flags().StringVar(&parentRef, "in", "", t("Put it inside this folder"))

	edit := &cobra.Command{
		Use:     "edit <folder>",
		Short:   t("Rename or move a folder"),
		Example: "hop folders edit Campaigns --name Marketing\nhop folders edit 2026 --in Archive\nhop folders edit 2026 --in none",
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			id, err := srv.folderID(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			b := map[string]any{}
			if name != "" {
				b["name"] = name
			}
			if cmd.Flags().Changed("in") {
				if parentRef == "" || strings.EqualFold(parentRef, "none") {
					b["parentId"] = nil
				} else if b["parentId"], err = srv.folderID(cmd.Context(), parentRef); err != nil {
					return err
				}
			}
			if len(b) == 0 {
				return usage(t("Nothing to change: name what to change."))
			}
			var out jsonRaw
			if err := srv.Do(cmd.Context(), http.MethodPatch, "/api/folders/"+id, nil, b, &out); err != nil {
				return err
			}
			if a.jsonOut {
				return printJSON(out)
			}
			ui.Success(t("Saved the folder %s", ui.Bold.Render(args[0])))
			return nil
		},
	}
	edit.Flags().StringVar(&name, "name", "", t("New name"))
	edit.Flags().StringVar(&parentRef, "in", "", t("Move it inside this folder (“none”: to the top)"))

	rm := &cobra.Command{
		Use:     "rm <folder>",
		Aliases: []string{"delete", "remove"},
		Short:   t("Delete a folder (its links stay)"),
		Long:    t("Delete a folder. Its links are not deleted: they go back to no folder, and the folders inside it move one level up."),
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			srv, err := a.connect()
			if err != nil {
				return err
			}
			id, err := srv.folderID(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			if err := a.confirm(t("Delete the folder %s? Its links stay.", args[0])); err != nil {
				return err
			}
			if err := srv.Do(cmd.Context(), http.MethodDelete, "/api/folders/"+id, nil, nil, nil); err != nil {
				return err
			}
			ui.Success(t("Deleted the folder %s", args[0]))
			return nil
		},
	}
	a.yesFlag(rm)
	return parent("folders", t("See and manage folders"), []string{"folder"}, list, add, edit, rm)
}
