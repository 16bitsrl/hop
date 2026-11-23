package cmd

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/api"
)

// linkFlags are the options shared by `hop create` and `hop edit`.
type linkFlags struct {
	url, slug, domain, title, notes, folder, expires, password, fallback string
	appURL, ogTitle, ogDescription, ogImage                              string
	tags, addTags, removeTags, rules, variants                           []string
	maxClicks, redirect                                                  int
	forwardQuery, publicStats, noPassword, noRules, noVariants           bool
	noTitleLookup                                                        bool
}

func (f *linkFlags) bind(cmd *cobra.Command, creating bool) {
	fl := cmd.Flags()
	if creating {
		fl.StringVar(&f.slug, "slug", "", t("Ending of the short link (default: a random ending)"))
		fl.StringVarP(&f.domain, "domain", "d", "", t("Short domain to use (default: your default domain)"))
		fl.BoolVar(&f.noTitleLookup, "no-title-lookup", false, t("Don't fetch the title from the destination page"))
	} else {
		fl.StringVar(&f.url, "url", "", t("New destination address"))
		fl.StringSliceVar(&f.addTags, "add-tag", nil, t("Add a tag, keeping the others"))
		fl.StringSliceVar(&f.removeTags, "remove-tag", nil, t("Remove a tag"))
		fl.BoolVar(&f.noPassword, "no-password", false, t("Remove the password"))
		fl.BoolVar(&f.noRules, "no-rules", false, t("Remove every rule"))
		fl.BoolVar(&f.noVariants, "no-variants", false, t("Stop the A/B test"))
	}
	fl.StringVarP(&f.title, "title", "t", "", t("Title, to recognise the link"))
	fl.StringVar(&f.notes, "notes", "", t("Notes only your team sees"))
	fl.StringSliceVar(&f.tags, "tag", nil, t("Tag to put on the link; repeat it or separate with commas"))
	fl.StringVar(&f.folder, "folder", "", t("Folder by name or path (Campaigns/2026); “none” takes it out of its folder"))
	fl.StringVar(&f.expires, "expires", "", t("When the link stops working: a date (2026-12-31), date and time, a duration (12h, 7d, 2w) or “never”"))
	fl.IntVar(&f.maxClicks, "max-clicks", 0, t("Stop after this number of clicks (0: no limit)"))
	fl.StringVar(&f.password, "password", "", t("Ask visitors for this password"))
	fl.IntVar(&f.redirect, "redirect", 0, t("Redirect type: 301, 302, 307 or 308"))
	fl.BoolVar(&f.forwardQuery, "forward-query", false, t("Pass what follows ? in the short link on to the destination"))
	fl.StringVar(&f.fallback, "fallback", "", t("Address for visitors who arrive after the link expired"))
	fl.StringArrayVar(&f.rules, "rule", nil, t("Send some visitors elsewhere, like \"device=ios country=IT lang=it url=https://…\"; repeat for more rules"))
	fl.StringArrayVar(&f.variants, "variant", nil, t("A/B test destination, like 50:https://…; give at least two"))
	fl.StringVar(&f.appURL, "app-url", "", t("App link to try first on phones (myapp://…)"))
	fl.StringVar(&f.ogTitle, "preview-title", "", t("Title shown when the link is shared on social networks and chats"))
	fl.StringVar(&f.ogDescription, "preview-description", "", t("Description shown when the link is shared"))
	fl.StringVar(&f.ogImage, "preview-image", "", t("Address of the image shown when the link is shared"))
	fl.BoolVar(&f.publicStats, "public-stats", false, t("Give the link a public statistics page"))
}

// parseWhen reads --expires: nil means "never".
func parseWhen(value string, now time.Time) (*time.Time, error) {
	v := strings.TrimSpace(value)
	switch strings.ToLower(v) {
	case "never", "none", "mai":
		return nil, nil
	}
	if len(v) >= 2 {
		if n, err := strconv.Atoi(v[:len(v)-1]); err == nil && n > 0 {
			var unit time.Duration
			switch v[len(v)-1] {
			case 'h':
				unit = time.Hour
			case 'd':
				unit = 24 * time.Hour
			case 'w':
				unit = 7 * 24 * time.Hour
			}
			if unit > 0 {
				when := now.Add(time.Duration(n) * unit)
				return &when, nil
			}
		}
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02"} {
		if when, err := time.ParseInLocation(layout, v, now.Location()); err == nil {
			if layout == "2006-01-02" {
				// A day alone means "until the end of that day".
				when = when.Add(24*time.Hour - time.Second)
			}
			return &when, nil
		}
	}
	return nil, usageHint(t("“%s” is not a date.", value), t("Use a date (2026-12-31), date and time (2026-12-31 18:00), a duration (12h, 7d, 2w) or “never”."))
}

// parseRule reads one --rule: space separated key=value pairs.
func parseRule(value string) (api.Rule, error) {
	var r api.Rule
	bad := func() (api.Rule, error) {
		return r, usageHint(t("This rule is not clear: %s", value), t("Write it like: --rule \"device=ios,android country=IT lang=it url=https://example.com/app\""))
	}
	for _, part := range strings.Fields(value) {
		key, val, ok := strings.Cut(part, "=")
		if !ok || val == "" {
			return bad()
		}
		switch strings.ToLower(key) {
		case "device", "devices":
			r.Devices = strings.Split(strings.ToLower(val), ",")
		case "country", "countries":
			r.Countries = strings.Split(strings.ToUpper(val), ",")
		case "lang", "language", "languages":
			r.Languages = strings.Split(strings.ToLower(val), ",")
		case "url":
			r.URL = val
		case "app":
			r.AppURL = val
		default:
			return bad()
		}
	}
	if r.URL == "" || (len(r.Devices) == 0 && len(r.Countries) == 0 && len(r.Languages) == 0) {
		return bad()
	}
	return r, nil
}

// parseVariant reads one --variant: "weight:address", or just the address for an equal share.
func parseVariant(value string) (api.Variant, error) {
	v := api.Variant{Weight: 1, URL: strings.TrimSpace(value)}
	if head, rest, ok := strings.Cut(v.URL, ":"); ok {
		if n, err := strconv.Atoi(head); err == nil {
			if n < 1 || n > 1000 {
				return v, usage(t("A weight must be between 1 and 1000: %s", value))
			}
			v.Weight, v.URL = n, rest
		}
	}
	if !strings.HasPrefix(v.URL, "http://") && !strings.HasPrefix(v.URL, "https://") {
		return v, usageHint(t("This A/B destination is not clear: %s", value), t("Write it like: --variant 70:https://example.com/a --variant 30:https://example.com/b"))
	}
	return v, nil
}

func splitTags(values []string) []string {
	out := []string{}
	for _, v := range values {
		for _, part := range strings.Split(v, ",") {
			if p := strings.TrimSpace(part); p != "" {
				out = append(out, p)
			}
		}
	}
	return out
}

// body builds what to send to the server from the options that were given. `current` is the link
// being edited (nil when creating): it is needed to add or remove single tags.
func (f *linkFlags) body(ctx context.Context, cmd *cobra.Command, srv *server, current *api.Link) (map[string]any, error) {
	body := map[string]any{}
	set := cmd.Flags().Changed
	text := func(flag, key, value string) {
		if set(flag) {
			body[key] = value // the server turns an empty text into "nothing"
		}
	}
	if set("url") {
		body["url"] = f.url
	}
	if set("slug") {
		body["slug"] = f.slug
	}
	if set("domain") {
		id, err := srv.domainID(ctx, f.domain)
		if err != nil {
			return nil, err
		}
		body["domainId"] = id
	}
	text("title", "title", f.title)
	text("notes", "notes", f.notes)
	text("fallback", "fallbackUrl", f.fallback)
	text("app-url", "appUrl", f.appURL)
	text("preview-title", "ogTitle", f.ogTitle)
	text("preview-description", "ogDescription", f.ogDescription)
	text("preview-image", "ogImage", f.ogImage)
	if f.noTitleLookup {
		body["fetchMeta"] = false
	}

	if set("tag") {
		body["tags"] = splitTags(f.tags)
	} else if current != nil && (set("add-tag") || set("remove-tag")) {
		drop := map[string]bool{}
		for _, name := range splitTags(f.removeTags) {
			drop[strings.ToLower(name)] = true
		}
		tags := []string{}
		for _, tag := range current.Tags {
			if !drop[strings.ToLower(tag.Name)] {
				tags = append(tags, tag.Name)
			}
		}
		body["tags"] = append(tags, splitTags(f.addTags)...)
	}
	if set("folder") {
		if f.folder == "" || strings.EqualFold(f.folder, "none") {
			body["folderId"] = nil
		} else {
			id, err := srv.folderID(ctx, f.folder)
			if err != nil {
				return nil, err
			}
			body["folderId"] = id
		}
	}
	if set("expires") {
		when, err := parseWhen(f.expires, time.Now())
		if err != nil {
			return nil, err
		}
		if when == nil {
			body["expiresAt"] = nil
		} else {
			body["expiresAt"] = when.UTC().Format(time.RFC3339)
		}
	}
	if set("max-clicks") {
		if f.maxClicks <= 0 {
			body["maxClicks"] = nil
		} else {
			body["maxClicks"] = f.maxClicks
		}
	}
	if f.noPassword {
		body["password"] = nil
	} else if set("password") {
		if f.password == "" {
			body["password"] = nil
		} else {
			body["password"] = f.password
		}
	}
	if set("redirect") {
		switch f.redirect {
		case 301, 302, 307, 308:
			body["redirectType"] = f.redirect
		default:
			return nil, usage(t("The redirect type must be 301, 302, 307 or 308."))
		}
	}
	if set("forward-query") {
		body["forwardQuery"] = f.forwardQuery
	}
	if set("public-stats") {
		body["publicStats"] = f.publicStats
	}
	if f.noRules {
		body["rules"] = []api.Rule{}
	} else if set("rule") {
		rules := []api.Rule{}
		for _, raw := range f.rules {
			r, err := parseRule(raw)
			if err != nil {
				return nil, err
			}
			rules = append(rules, r)
		}
		body["rules"] = rules
	}
	if f.noVariants {
		body["variants"] = []api.Variant{}
	} else if set("variant") {
		variants := []api.Variant{}
		for _, raw := range f.variants {
			v, err := parseVariant(raw)
			if err != nil {
				return nil, err
			}
			variants = append(variants, v)
		}
		if len(variants) < 2 {
			return nil, usage(t("An A/B test needs at least two destinations: repeat --variant."))
		}
		body["variants"] = variants
	}
	return body, nil
}
