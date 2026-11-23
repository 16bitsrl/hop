// Package ui is how the app looks in a terminal: colours, messages, tables, charts and prompts.
package ui

import (
	"fmt"
	"io"
	"os"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/colorprofile"
	"github.com/charmbracelet/x/ansi"
	"golang.org/x/term"
)

var (
	// Out and Err drop colours by themselves when the output is not a terminal or NO_COLOR is set.
	Out *colorprofile.Writer
	Err *colorprofile.Writer
	// OutTTY and ErrTTY tell whether a person is looking at the output.
	OutTTY, ErrTTY bool
	// InTTY tells whether a person can answer questions.
	InTTY bool

	Accent, Muted, Good, Bad, Warn, Bold, Link lipgloss.Style
)

// Init sets up the output. Call it once, before printing.
func Init(stdout, stderr io.Writer, noColor bool) {
	// Older Windows consoles need to be told to understand colour codes; a no-op elsewhere.
	lipgloss.EnableLegacyWindowsANSI(os.Stdout)
	lipgloss.EnableLegacyWindowsANSI(os.Stderr)
	Out = colorprofile.NewWriter(stdout, os.Environ())
	Err = colorprofile.NewWriter(stderr, os.Environ())
	OutTTY = isTerminal(stdout)
	ErrTTY = isTerminal(stderr)
	InTTY = term.IsTerminal(int(os.Stdin.Fd()))
	if noColor {
		Out.Profile, Err.Profile = colorprofile.NoTTY, colorprofile.NoTTY
	}
	dark := true
	if OutTTY && InTTY && !noColor {
		dark = lipgloss.HasDarkBackground(os.Stdin, os.Stdout)
	}
	pick := lipgloss.LightDark(dark)
	// The greens of the web app.
	Accent = lipgloss.NewStyle().Foreground(pick(lipgloss.Color("#0f7a5c"), lipgloss.Color("#3cc596")))
	Muted = lipgloss.NewStyle().Foreground(pick(lipgloss.Color("#6b7280"), lipgloss.Color("#8b949e")))
	Good = lipgloss.NewStyle().Foreground(pick(lipgloss.Color("#15803d"), lipgloss.Color("#4ade80")))
	Bad = lipgloss.NewStyle().Foreground(pick(lipgloss.Color("#b91c1c"), lipgloss.Color("#f87171")))
	Warn = lipgloss.NewStyle().Foreground(pick(lipgloss.Color("#b45309"), lipgloss.Color("#fbbf24")))
	Bold = lipgloss.NewStyle().Bold(true)
	Link = Accent.Underline(true)
}

func isTerminal(w io.Writer) bool {
	f, ok := w.(*os.File)
	return ok && term.IsTerminal(int(f.Fd()))
}

// Colors tells whether the output shows colours (a terminal that has them, and nobody turned them off).
func Colors() bool { return OutTTY && Out.Profile >= colorprofile.ANSI }

// Width is the width of the terminal, or 0 when the output is not one (then nothing is cut).
func Width() int {
	if !OutTTY {
		return 0
	}
	if w, _, err := term.GetSize(int(os.Stdout.Fd())); err == nil && w > 0 {
		return w
	}
	return 80
}

// Println writes a line to the standard output.
func Println(a ...any) { fmt.Fprintln(Out, a...) }

// Eprintln writes a line to the standard error: for what a person reads while the answer goes elsewhere.
func Eprintln(a ...any) { fmt.Fprintln(Err, a...) }

// Printf writes to the standard output.
func Printf(format string, a ...any) { fmt.Fprintf(Out, format, a...) }

// Success tells that something was done.
func Success(msg string) { fmt.Fprintln(Err, Good.Render("✓")+" "+msg) }

// Info is a neutral note.
func Info(msg string) { fmt.Fprintln(Err, Muted.Render("•")+" "+msg) }

// Warning points at something to look at.
func Warning(msg string) { fmt.Fprintln(Err, Warn.Render("!")+" "+msg) }

// Failure reports an error, with an optional hint on what to do next.
func Failure(msg, hint string) {
	fmt.Fprintln(Err, Bad.Render("✗")+" "+msg)
	if hint != "" {
		fmt.Fprintln(Err, "  "+Muted.Render(hint))
	}
}

// Hint is a dim line under a message.
func Hint(msg string) { fmt.Fprintln(Err, "  "+Muted.Render(msg)) }

// Title is a section heading.
func Title(text string) string { return Bold.Render(text) }

// Field is one line of a details view.
type Field struct{ Label, Value string }

// Fields prints "label  value" lines with the labels aligned. Empty values are skipped.
func Fields(fields []Field) { FieldsIndent(fields, 2) }

// FieldsIndent is Fields with a chosen left margin, for lists under a heading.
func FieldsIndent(fields []Field, margin int) {
	indent := strings.Repeat(" ", margin)
	width := 0
	for _, f := range fields {
		if f.Value != "" {
			width = max(width, lipgloss.Width(f.Label))
		}
	}
	for _, f := range fields {
		if f.Value == "" {
			continue
		}
		lines := strings.Split(f.Value, "\n")
		Println(indent + Muted.Render(pad(f.Label, width)) + "  " + lines[0])
		for _, l := range lines[1:] {
			Println(indent + strings.Repeat(" ", width) + "  " + l)
		}
	}
}

func pad(s string, width int) string {
	if n := width - lipgloss.Width(s); n > 0 {
		return s + strings.Repeat(" ", n)
	}
	return s
}

func padLeft(s string, width int) string {
	if n := width - lipgloss.Width(s); n > 0 {
		return strings.Repeat(" ", n) + s
	}
	return s
}

// Truncate shortens a text to width cells, ending with an ellipsis.
func Truncate(s string, width int) string {
	if width <= 0 {
		return s
	}
	return ansi.Truncate(s, width, "…")
}

// Table prints rows under headers. One column (Flex) gives up space when the terminal is narrow.
type Table struct {
	Headers []string
	Rows    [][]string
	// Right lists the columns aligned to the right (numbers).
	Right []int
	// Flex is the column that shrinks first; -1 for none.
	Flex int
}

// Print writes the table. Without a terminal it writes plain tab separated values, easy to cut and grep.
func (t Table) Print() {
	if !OutTTY {
		for _, row := range t.Rows {
			Println(strings.Join(row, "\t"))
		}
		return
	}
	cols := len(t.Headers)
	widths := make([]int, cols)
	for i, h := range t.Headers {
		widths[i] = lipgloss.Width(h)
	}
	for _, row := range t.Rows {
		for i := 0; i < cols && i < len(row); i++ {
			widths[i] = max(widths[i], lipgloss.Width(row[i]))
		}
	}
	const gap = 2
	total := gap*(cols-1) + 2
	for _, w := range widths {
		total += w
	}
	if over := total - Width(); over > 0 && t.Flex >= 0 && t.Flex < cols {
		widths[t.Flex] = max(12, widths[t.Flex]-over)
	}
	right := map[int]bool{}
	for _, i := range t.Right {
		right[i] = true
	}
	line := func(cells []string, style func(string) string) string {
		var b strings.Builder
		b.WriteString("  ")
		for i := 0; i < cols; i++ {
			cell := ""
			if i < len(cells) {
				cell = Truncate(cells[i], widths[i])
			}
			if style != nil {
				cell = style(cell)
			}
			if right[i] {
				cell = padLeft(cell, widths[i])
			} else if i < cols-1 {
				cell = pad(cell, widths[i])
			}
			b.WriteString(cell)
			if i < cols-1 {
				b.WriteString(strings.Repeat(" ", gap))
			}
		}
		return strings.TrimRight(b.String(), " ")
	}
	upper := make([]string, cols)
	for i, h := range t.Headers {
		upper[i] = strings.ToUpper(h)
	}
	Println(line(upper, func(s string) string { return Muted.Render(s) }))
	for _, row := range t.Rows {
		Println(line(row, nil))
	}
}

// Box frames a few lines, for the things a person must not miss (a code to compare).
func Box(lines ...string) string {
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(Accent.GetForeground()).
		Padding(0, 2).
		Render(strings.Join(lines, "\n"))
}
