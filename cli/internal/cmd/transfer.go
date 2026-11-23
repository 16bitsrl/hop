package cmd

import (
	"bytes"
	"context"
	"encoding/csv"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
	"github.com/16bitsrl/hop/cli/internal/ui"
)

func sortStrings(s []string) { sort.Strings(s) }

// importBatch is how many links the server takes in one request.
const importBatch = 25

type importRow struct {
	Line   int      `json:"line"`
	URL    string   `json:"url"`
	Slug   string   `json:"slug"`
	Errors []string `json:"errors"`
}

func importProblem(code string) string {
	msg, _ := apiMessage(&api.Error{Status: 400, Code: code})
	return msg
}

func (a *app) importCmd() *cobra.Command {
	var dryRun bool
	cmd := &cobra.Command{
		Use:   "import <file.csv>",
		Short: t("Create many links from a CSV file"),
		Long: t("Create many links from a CSV file. The file needs a column called url; slug, title, tags (separated by ;), folder, notes and domain are optional.") + "\n\n" +
			t("The file is checked first: rows with problems are listed and skipped. Use “-” to read the file from the standard input."),
		Example: "hop import links.csv --dry-run\nhop import links.csv\n# " + t("An example file to start from") + "\nhop import --template > links.csv",
		Args:    maxArgs(1),
	}
	var template bool
	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		srv, err := a.connect()
		if err != nil {
			return err
		}
		if template {
			data, _, err := srv.Raw(ctx, http.MethodGet, "/api/links/import/template", nil, nil)
			if err != nil {
				return err
			}
			_, err = os.Stdout.Write(data)
			return err
		}
		if len(args) != 1 {
			return usage(t("Which file? Add its name: hop import links.csv"))
		}
		var data []byte
		if args[0] == "-" {
			data, err = io.ReadAll(os.Stdin)
		} else {
			data, err = os.ReadFile(args[0])
		}
		if err != nil {
			return fail(t("The file could not be read: %s", err.Error()))
		}
		var preview struct {
			Rows       []importRow `json:"rows"`
			ValidCount int         `json:"validCount"`
		}
		if err := srv.Do(ctx, http.MethodPost, "/api/links/import/preview", nil, map[string]any{"csv": string(data)}, &preview); err != nil {
			return err
		}
		bad := 0
		for _, row := range preview.Rows {
			if len(row.Errors) > 0 {
				bad++
			}
		}
		printProblems := func(rows []importRow) {
			for _, row := range rows {
				if len(row.Errors) == 0 {
					continue
				}
				problems := make([]string, len(row.Errors))
				for i, code := range row.Errors {
					problems[i] = importProblem(code)
				}
				ui.Warning(t("Line %d (%s): %s", row.Line, row.URL, strings.Join(problems, " ")))
			}
		}
		if dryRun {
			if a.jsonOut {
				return printJSON(preview)
			}
			printProblems(preview.Rows)
			ui.Info(t("%d links are ready to be created, %d rows have problems. Nothing was created.", preview.ValidCount, bad))
			return nil
		}
		if preview.ValidCount == 0 {
			printProblems(preview.Rows)
			return fail(t("There is nothing to create in this file."))
		}

		records, err := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(data, []byte("\xef\xbb\xbf")))).ReadAll()
		if err != nil || len(records) < 2 {
			return fail(t("The file could not be read as CSV."))
		}
		header, rows := records[0], records[1:]
		created := 0
		var failed []importRow
		err = ui.Spin(ctx, t("Creating %d links…", preview.ValidCount), func(ctx context.Context) error {
			for start := 0; start < len(rows); start += importBatch {
				var buf bytes.Buffer
				w := csv.NewWriter(&buf)
				_ = w.Write(header)
				_ = w.WriteAll(rows[start:min(start+importBatch, len(rows))])
				var result struct {
					Created int         `json:"created"`
					Failed  []importRow `json:"failed"`
				}
				if err := srv.Do(ctx, http.MethodPost, "/api/links/import", nil, map[string]any{"csv": buf.String(), "lineOffset": start}, &result); err != nil {
					return err
				}
				created += result.Created
				failed = append(failed, result.Failed...)
			}
			return nil
		})
		if err != nil {
			if created > 0 {
				ui.Warning(t("%d links were created before the problem.", created))
			}
			return err
		}
		if a.jsonOut {
			return printJSON(map[string]any{"created": created, "failed": failed})
		}
		printProblems(failed)
		ui.Success(t("%d links created, %d rows skipped.", created, len(failed)))
		return nil
	}
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, t("Only check the file, create nothing"))
	cmd.Flags().BoolVar(&template, "template", false, t("Print an example file"))
	return cmd
}

func (a *app) exportCmd() *cobra.Command {
	var output string
	cmd := &cobra.Command{
		Use:     "export",
		Short:   t("Save every link to a CSV file"),
		Long:    t("Save every link to a CSV file. The file can be imported again with `hop import`."),
		Example: "hop export -o links.csv\nhop export > links.csv",
		Args:    noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			srv, err := a.connect()
			if err != nil {
				return err
			}
			if output == "" && ui.OutTTY {
				return usageHint(t("Where should the links go?"), t("Name a file with -o links.csv, or send the output to one: hop export > links.csv"))
			}
			folders, err := srv.folders(ctx)
			if err != nil {
				return err
			}
			var links []api.Link
			err = ui.Spin(ctx, t("Reading the links…"), func(ctx context.Context) error {
				for page := 1; ; page++ {
					var one api.LinkPage
					if err := srv.Get(ctx, "/api/links", api.Query{"pageSize": "100", "page": strconv.Itoa(page), "sort": "created", "dir": "asc"}, &one); err != nil {
						return err
					}
					links = append(links, one.Items...)
					if len(one.Items) == 0 || len(links) >= one.Total {
						return nil
					}
				}
			})
			if err != nil {
				return err
			}
			var buf bytes.Buffer
			w := csv.NewWriter(&buf)
			_ = w.Write([]string{"url", "slug", "title", "tags", "folder", "notes", "domain", "short_url", "clicks", "enabled", "expires_at", "created_at", "owner"})
			for _, l := range links {
				names := make([]string, len(l.Tags))
				for i, tag := range l.Tags {
					names[i] = tag.Name
				}
				folder := ""
				if l.FolderID != nil {
					// The import matches folders by their own name, not by their path.
					for _, f := range folders {
						if f.ID == *l.FolderID {
							folder = f.Name
						}
					}
				}
				expires := ""
				if l.ExpiresAt != nil {
					expires = l.ExpiresAt.UTC().Format(time.RFC3339)
				}
				_ = w.Write([]string{l.URL, l.Slug, deref(l.Title), strings.Join(names, ";"), folder, deref(l.Notes), l.Host, l.ShortURL,
					strconv.Itoa(l.ClickCount), strconv.FormatBool(l.Enabled), expires, l.CreatedAt.UTC().Format(time.RFC3339), deref(l.OwnerName)})
			}
			w.Flush()
			if output == "" || output == "-" {
				_, err := os.Stdout.Write(buf.Bytes())
				return err
			}
			if err := os.WriteFile(output, buf.Bytes(), 0o644); err != nil {
				return fail(t("The file could not be written: %s", err.Error()))
			}
			ui.Success(t("%d links saved to %s", len(links), output))
			return nil
		},
	}
	cmd.Flags().StringVarP(&output, "output", "o", "", t("File to write (default: the standard output)"))
	return cmd
}
