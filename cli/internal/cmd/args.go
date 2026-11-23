package cmd

import (
	"regexp"
	"strings"

	"github.com/spf13/cobra"
)

// wrongArgs explains how a command is called when the values given don't fit.
func wrongArgs(cmd *cobra.Command) error {
	return usageHint(t("That is not how this command is used: %s", cmd.UseLine()), t("Run `%s --help` for the details.", cmd.CommandPath()))
}

func exactArgs(n int) cobra.PositionalArgs {
	return func(cmd *cobra.Command, args []string) error {
		if len(args) != n {
			return wrongArgs(cmd)
		}
		return nil
	}
}

func maxArgs(n int) cobra.PositionalArgs {
	return func(cmd *cobra.Command, args []string) error {
		if len(args) > n {
			return wrongArgs(cmd)
		}
		return nil
	}
}

func minArgs(n int) cobra.PositionalArgs {
	return func(cmd *cobra.Command, args []string) error {
		if len(args) < n {
			return wrongArgs(cmd)
		}
		return nil
	}
}

func noArgs(cmd *cobra.Command, args []string) error {
	if len(args) > 0 {
		if cmd.HasAvailableSubCommands() {
			return usageHint(t("Unknown command: %s", cmd.CommandPath()+" "+args[0]), t("Run `%s --help` for the details.", cmd.CommandPath()))
		}
		return wrongArgs(cmd)
	}
	return nil
}

var (
	unknownFlag  = regexp.MustCompile(`^unknown (?:shorthand )?flag: (.+?)(?: in -.+)?$`)
	needsValue   = regexp.MustCompile(`^flag needs an argument: (.+)$`)
	invalidValue = regexp.MustCompile(`^invalid argument "(.*)" for "(.+?)" flag`)
)

// flagError puts what the option parser says into the app's words.
func flagError(cmd *cobra.Command, err error) error {
	msg := err.Error()
	hint := t("Run `%s --help` for the details.", cmd.CommandPath())
	if m := unknownFlag.FindStringSubmatch(msg); m != nil {
		return usageHint(t("Unknown option: %s", strings.Trim(m[1], "'")), hint)
	}
	if m := needsValue.FindStringSubmatch(msg); m != nil {
		return usageHint(t("The option %s needs a value.", m[1]), hint)
	}
	if m := invalidValue.FindStringSubmatch(msg); m != nil {
		return usageHint(t("“%s” is not a valid value for %s.", m[1], m[2]), hint)
	}
	return usageHint(msg, hint)
}
