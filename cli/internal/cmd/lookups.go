package cmd

import (
	"context"
	"regexp"
	"strings"

	"github.com/16bitsrl/hop/cli/internal/api"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func (s *server) domains(ctx context.Context) ([]api.Domain, error) {
	var out struct {
		Domains []api.Domain `json:"domains"`
	}
	return out.Domains, s.Get(ctx, "/api/domains", nil, &out)
}

func (s *server) tags(ctx context.Context) ([]api.Tag, error) {
	var out struct {
		Tags []api.Tag `json:"tags"`
	}
	return out.Tags, s.Get(ctx, "/api/tags", nil, &out)
}

func (s *server) folders(ctx context.Context) ([]api.Folder, error) {
	var out struct {
		Folders []api.Folder `json:"folders"`
	}
	return out.Folders, s.Get(ctx, "/api/folders", nil, &out)
}

// domainID accepts a host ("go.example.com") or an id.
func (s *server) domainID(ctx context.Context, ref string) (string, error) {
	list, err := s.domains(ctx)
	if err != nil {
		return "", err
	}
	want := strings.ToLower(strings.TrimSpace(ref))
	for _, d := range list {
		if d.ID == ref || d.Host == want {
			return d.ID, nil
		}
	}
	hosts := make([]string, len(list))
	for i, d := range list {
		hosts[i] = d.Host
	}
	return "", failHint(t("There is no domain called “%s”.", ref), t("Available: %s", strings.Join(hosts, ", ")))
}

// folderPath is the full name of a folder: "Campaigns/2026".
func folderPath(all []api.Folder, id string) string {
	byID := map[string]api.Folder{}
	for _, f := range all {
		byID[f.ID] = f
	}
	var parts []string
	for cur, ok := byID[id]; ok && len(parts) < 20; {
		parts = append([]string{cur.Name}, parts...)
		if cur.ParentID == nil {
			break
		}
		cur, ok = byID[*cur.ParentID]
	}
	return strings.Join(parts, "/")
}

// folderID accepts an id, a name or a path ("Campaigns/2026"). Names are matched ignoring case.
func (s *server) folderID(ctx context.Context, ref string) (string, error) {
	all, err := s.folders(ctx)
	if err != nil {
		return "", err
	}
	want := strings.ToLower(strings.Trim(strings.TrimSpace(ref), "/"))
	var matches []api.Folder
	for _, f := range all {
		if f.ID == ref {
			return f.ID, nil
		}
		if strings.ToLower(folderPath(all, f.ID)) == want || (!strings.Contains(want, "/") && strings.ToLower(f.Name) == want) {
			matches = append(matches, f)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0].ID, nil
	case 0:
		return "", failHint(t("There is no folder called “%s”.", ref), t("Run `hop folders` to see them, or `hop folders add` to create one."))
	}
	paths := make([]string, len(matches))
	for i, f := range matches {
		paths[i] = folderPath(all, f.ID)
	}
	return "", failHint(t("Several folders are called “%s”. Use the full path.", ref), strings.Join(paths, ", "))
}

func (s *server) tagByName(ctx context.Context, name string) (*api.Tag, error) {
	all, err := s.tags(ctx)
	if err != nil {
		return nil, err
	}
	for i, tag := range all {
		if tag.ID == name || strings.EqualFold(tag.Name, strings.TrimSpace(name)) {
			return &all[i], nil
		}
	}
	return nil, failHint(t("There is no tag called “%s”.", name), t("Run `hop tags` to see them."))
}

// ownerID accepts "me", an id, or the name of a person (or a part of it that only one person has).
func (s *server) ownerID(ctx context.Context, ref string) (string, error) {
	if strings.EqualFold(ref, "me") {
		user, err := whoAmI(ctx, s.Client)
		if err != nil {
			return "", err
		}
		if user == nil {
			return "", &api.Error{Status: 401, Code: "unauthorized"}
		}
		return user.ID, nil
	}
	var out struct {
		Users []struct{ ID, Name string } `json:"users"`
	}
	if err := s.Get(ctx, "/api/users/directory", nil, &out); err != nil {
		return "", err
	}
	want := strings.ToLower(ref)
	var found []string
	for _, u := range out.Users {
		if u.ID == ref || strings.ToLower(u.Name) == want {
			return u.ID, nil
		}
		if strings.Contains(strings.ToLower(u.Name), want) {
			found = append(found, u.ID)
		}
	}
	if len(found) == 1 {
		return found[0], nil
	}
	return "", fail(t("There is no person called “%s”.", ref))
}

// findLink turns what a person typed into a link: its id, its short address
// ("go.example.com/sale", with or without https://) or just its ending ("sale").
func (s *server) findLink(ctx context.Context, ref string) (*api.Link, error) {
	ref = strings.TrimSpace(ref)
	var byID *api.Link
	if uuidPattern.MatchString(ref) {
		var out struct {
			Link api.Link `json:"link"`
		}
		err := s.Get(ctx, "/api/links/"+ref, nil, &out)
		var apiErr *api.Error
		switch {
		case err == nil:
			byID = &out.Link
		case errorsAs(err, &apiErr) && apiErr.Status == 404:
			// Not an id: an ending may look like one.
		default:
			return nil, err
		}
	}
	clean := strings.TrimPrefix(strings.TrimPrefix(ref, "https://"), "http://")
	clean = strings.TrimSuffix(strings.TrimSuffix(clean, "/"), "+")
	host, slug := "", clean
	if i := strings.LastIndex(clean, "/"); i >= 0 {
		host, slug = strings.ToLower(clean[:i]), clean[i+1:]
	}
	if slug == "" {
		return nil, usage(t("“%s” is not a link.", ref))
	}
	q := api.Query{"slug": slug, "pageSize": "100"}
	if host != "" {
		// Ask for that domain only: the same ending may exist on many.
		if domains, err := s.domains(ctx); err == nil {
			for _, d := range domains {
				if d.Host == host || d.Host == strings.Split(host, ":")[0] {
					q["domain"] = d.ID
				}
			}
		}
	}
	var page api.LinkPage
	if err := s.Get(ctx, "/api/links", q, &page); err != nil {
		return nil, err
	}
	var matches []api.Link
	for _, l := range page.Items {
		if l.Slug != slug {
			continue
		}
		// The short address may carry a port in development ("s.localhost:8787").
		if host != "" && l.Host != host && !strings.Contains(l.ShortURL, "//"+host+"/") {
			continue
		}
		matches = append(matches, l)
	}
	if byID != nil {
		// The same text is the id of one link and the ending of another: never guess which.
		for _, l := range matches {
			if l.ID != byID.ID {
				return nil, failHint(t("“%s” is the id of one link and the ending of another. Say which one with its short address.", ref), byID.Host+"/"+byID.Slug+", "+l.Host+"/"+l.Slug)
			}
		}
		return byID, nil
	}
	switch len(matches) {
	case 1:
		return &matches[0], nil
	case 0:
		return nil, failHint(t("There is no link ending with “%s”.", slug), t("Find it with `hop list --search %s`.", slug))
	}
	urls := make([]string, len(matches))
	for i, l := range matches {
		urls[i] = l.Host + "/" + l.Slug
	}
	return nil, failHint(t("Several links end with “%s”. Say which one with its domain.", slug), strings.Join(urls, ", "))
}
