package ui

import (
	"context"
	"errors"
	"os"

	"charm.land/bubbles/v2/key"
	"charm.land/huh/v2"
	"charm.land/huh/v2/spinner"
	"charm.land/lipgloss/v2"

	"github.com/16bitsrl/hop/cli/internal/i18n"
)

// ErrCancelled is returned when the person leaves a question with Ctrl+C or Esc.
var ErrCancelled = errors.New("cancelled")

func theme() huh.Theme {
	return huh.ThemeFunc(func(isDark bool) *huh.Styles {
		s := huh.ThemeBase(isDark)
		accent := Accent.GetForeground()
		s.Focused.Title = s.Focused.Title.Foreground(accent).Bold(true)
		s.Focused.Base = s.Focused.Base.BorderForeground(accent)
		s.Focused.SelectSelector = s.Focused.SelectSelector.Foreground(accent)
		s.Focused.SelectedOption = s.Focused.SelectedOption.Foreground(accent)
		s.Focused.FocusedButton = s.Focused.FocusedButton.Background(accent).Foreground(lipgloss.Color("#ffffff"))
		s.Focused.TextInput.Prompt = s.Focused.TextInput.Prompt.Foreground(accent)
		s.Focused.TextInput.Cursor = s.Focused.TextInput.Cursor.Foreground(accent)
		s.Focused.Description = s.Focused.Description.Foreground(Muted.GetForeground())
		s.Blurred.Description = s.Focused.Description
		return s
	})
}

// keys is the default key map with the hints under a form in the person's language.
func keys() *huh.KeyMap {
	km := huh.NewDefaultKeyMap()
	hint := func(b *key.Binding, text string) { b.SetHelp(b.Help().Key, text) }
	next, back, send := i18n.T("next"), i18n.T("back"), i18n.T("confirm")
	hint(&km.Input.Next, next)
	hint(&km.Input.Prev, back)
	hint(&km.Input.Submit, send)
	hint(&km.Confirm.Next, next)
	hint(&km.Confirm.Prev, back)
	hint(&km.Confirm.Submit, send)
	hint(&km.Confirm.Toggle, i18n.T("choose"))
	hint(&km.Select.Next, next)
	hint(&km.Select.Prev, back)
	hint(&km.Select.Submit, send)
	hint(&km.Select.Up, i18n.T("up"))
	hint(&km.Select.Down, i18n.T("down"))
	hint(&km.Select.Filter, i18n.T("search"))
	return km
}

// RunForm shows a form and waits for the answers.
func RunForm(fields ...huh.Field) error {
	err := huh.NewForm(huh.NewGroup(fields...)).WithTheme(theme()).WithKeyMap(keys()).WithOutput(os.Stderr).Run()
	if errors.Is(err, huh.ErrUserAborted) {
		return ErrCancelled
	}
	return err
}

// Confirm asks a yes/no question. The default answer is no.
func Confirm(question, yes, no string) (bool, error) {
	var ok bool
	err := RunForm(huh.NewConfirm().Title(question).Affirmative(yes).Negative(no).Value(&ok))
	return ok, err
}

// Spin shows a spinner with a message while the work runs. Without a terminal it just runs the work.
func Spin(ctx context.Context, title string, work func(context.Context) error) error {
	if !ErrTTY {
		return work(ctx)
	}
	var workErr error
	err := spinner.New().Title(" " + title).WithTheme(spinner.ThemeFunc(func(isDark bool) *spinner.Styles {
		s := spinner.ThemeDefault(isDark)
		s.Spinner = s.Spinner.Foreground(Accent.GetForeground())
		return s
	})).Context(ctx).ActionWithErr(func(c context.Context) error {
		workErr = work(c)
		return workErr
	}).WithOutput(os.Stderr).Run()
	if workErr != nil {
		return workErr
	}
	return err
}
