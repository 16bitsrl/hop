package ui

import (
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"
)

var eighths = []rune(" ▁▂▃▄▅▆▇█")

// Columns draws values as vertical bars, `height` lines tall and at most `width` cells wide.
// When there are more values than cells, neighbours are added together.
func Columns(values []int, width, height int) []string {
	if len(values) == 0 || width <= 0 {
		return nil
	}
	if len(values) > width {
		merged := make([]int, width)
		for i, v := range values {
			merged[i*width/len(values)] += v
		}
		values = merged
	}
	// Few values on a wide terminal: each one gets a thicker bar, with a gap between bars.
	thick := min(width/len(values), 4)
	gap := ""
	if thick >= 3 {
		thick, gap = thick-1, " "
	}
	peak := 0
	for _, v := range values {
		peak = max(peak, v)
	}
	lines := make([]string, height)
	for row := 0; row < height; row++ {
		var b strings.Builder
		for _, v := range values {
			level := 0
			if peak > 0 {
				level = v * height * 8 / peak
				if v > 0 && level == 0 {
					level = 1
				}
			}
			// Row 0 is the top line.
			cell := level - (height-1-row)*8
			cell = min(max(cell, 0), 8)
			b.WriteString(strings.Repeat(string(eighths[cell]), thick) + gap)
		}
		lines[row] = Accent.Render(b.String())
	}
	return lines
}

// Bar is one row of a breakdown.
type Bar struct {
	Label string
	Value int
}

// LabelWidth is the room the labels of some breakdowns need, so that several lists can line up.
func LabelWidth(width int, lists ...[]Bar) int {
	labelW := 0
	for _, rows := range lists {
		for _, r := range rows {
			labelW = max(labelW, lipgloss.Width(r.Label))
		}
	}
	return min(labelW, max(12, width/3))
}

// Bars draws a breakdown as horizontal bars with the value and its share of the total.
// labelW is the width of the label column (see LabelWidth).
func Bars(rows []Bar, total, width, labelW int) []string {
	if len(rows) == 0 {
		return nil
	}
	valueW, peak := 0, 0
	for _, r := range rows {
		valueW = max(valueW, len(Number(r.Value)))
		peak = max(peak, r.Value)
	}
	barW := max(6, width-labelW-valueW-10)
	barW = min(barW, 28)
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		n := 0
		if peak > 0 {
			n = r.Value * barW * 8 / peak
		}
		bar := strings.Repeat("█", n/8)
		if n%8 > 0 {
			bar += string([]rune(" ▏▎▍▌▋▊▉")[n%8])
		}
		share := ""
		if total > 0 {
			share = strconv.Itoa((r.Value*100+total/2)/total) + "%"
		}
		out = append(out, pad(Truncate(r.Label, labelW), labelW)+"  "+Accent.Render(pad(bar, barW))+"  "+padLeft(Number(r.Value), valueW)+"  "+Muted.Render(padLeft(share, 4)))
	}
	return out
}

// Number writes 12345 as "12,345" (or "12.345" in Italian, set by SetThousands).
func Number(n int) string {
	s := strconv.Itoa(n)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteString(thousands)
		}
		b.WriteRune(c)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

var thousands = ","

// SetThousands chooses the separator between thousands.
func SetThousands(sep string) { thousands = sep }
