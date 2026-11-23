package cmd

import (
	"strings"

	"github.com/16bitsrl/hop/cli/internal/api"
)

// apiMessage explains an answer the server refused, in the words of the web app.
func apiMessage(e *api.Error) (msg, hint string) {
	switch e.Code {
	case "unauthorized":
		return t("Your sign-in is not valid anymore."), t("Run `hop login` again.")
	case "forbidden":
		return t("You don't have permission to do this."), ""
	case "not_found":
		return t("We couldn't find that."), ""
	case "invalid_request":
		if len(e.Fields) > 0 {
			return t("Some values are not valid: %s", strings.Join(e.Fields, ", ")), ""
		}
		return t("Some values are not valid."), ""
	case "slug_taken":
		return t("This short link ending is already in use."), t("Choose another one with --slug, or leave it out to get a random one.")
	case "destination_blocked":
		return t("This website is blocked by your administrator."), ""
	case "destination_unsafe":
		return t("This website was flagged as unsafe, so it can't be used."), ""
	case "invalid_url":
		return t("This is not a valid web address."), ""
	case "unknown_domain":
		return t("That domain doesn't exist."), t("Run `hop domains` to see the ones you can use.")
	case "no_domain":
		return t("Add a domain before creating links."), t("An administrator can do it with `hop domains add go.example.com`.")
	case "unknown_folder":
		return t("That folder doesn't exist."), ""
	case "folder_cycle":
		return t("A folder can't be moved inside itself."), ""
	case "domain_exists":
		return t("This domain is already added."), ""
	case "domain_has_links":
		return t("This domain still has links. Move or delete them first."), ""
	case "domain_is_default":
		return t("This is the default domain. Choose another default first."), ""
	case "domain_is_app_host":
		return t("This is the address of the hop app itself, so it can't be used for short links."), ""
	case "tag_exists":
		return t("A tag with this name already exists."), ""
	case "blocked_exists":
		return t("This domain is already blocked."), ""
	case "alphabet_too_short":
		return t("Use at least two different characters."), ""
	case "csv_empty":
		return t("The file is empty."), ""
	case "csv_missing_url":
		return t("The file needs a column called url."), ""
	case "csv_too_many_rows":
		return t("The file has too many rows. The limit is 500."), ""
	case "invalid_range":
		return t("The date range is not valid."), ""
	case "batch_too_large":
		return t("That is too much to do in one go. Try again with fewer items."), ""
	case "folder_not_yours_inside":
		return t("This folder contains links or folders that belong to other people, so only an administrator can delete it."), ""
	case "too_many_keys":
		return t("You have too many active keys. Revoke one first."), ""
	case "mail_not_configured":
		return t("Email is not set up yet."), ""
	}
	if e.Status >= 500 {
		return t("The server had a problem (%d). Try again in a moment.", e.Status), ""
	}
	return t("The server refused the request: %s", e.Code), ""
}
