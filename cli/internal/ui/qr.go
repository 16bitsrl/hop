package ui

import (
	"fmt"
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"
	qrcode "github.com/skip2/go-qrcode"
)

// QR draws a QR code with half blocks, two modules per line. In a terminal it is always black on
// white, so a phone reads it whatever the colours of the terminal are.
func QR(content string) (string, error) {
	q, err := qrcode.New(content, qrcode.Medium)
	if err != nil {
		return "", err
	}
	bits := q.Bitmap()
	// The library adds a quiet zone of 4 modules; 2 are enough on a screen.
	const trim = 2
	bits = bits[trim : len(bits)-trim]
	for i := range bits {
		bits[i] = bits[i][trim : len(bits[i])-trim]
	}
	style := lipgloss.NewStyle().Foreground(lipgloss.Color("#000000")).Background(lipgloss.Color("#ffffff"))
	var out []string
	for y := 0; y < len(bits); y += 2 {
		var b strings.Builder
		for x := range bits[y] {
			top := bits[y][x]
			bottom := y+1 < len(bits) && bits[y+1][x]
			switch {
			case top && bottom:
				b.WriteRune('█')
			case top:
				b.WriteRune('▀')
			case bottom:
				b.WriteRune('▄')
			default:
				b.WriteRune(' ')
			}
		}
		out = append(out, "  "+style.Render(b.String()))
	}
	return strings.Join(out, "\n"), nil
}

// QRPlain draws the code for outputs without colours: light blocks on the (assumed dark) background.
func QRPlain(content string) (string, error) {
	q, err := qrcode.New(content, qrcode.Medium)
	if err != nil {
		return "", err
	}
	return q.ToSmallString(false), nil
}

// QRPNG renders the code as a PNG image of the given size in pixels.
func QRPNG(content string, size int, fg, bg color.Color) ([]byte, error) {
	q, err := qrcode.New(content, qrcode.Medium)
	if err != nil {
		return nil, err
	}
	q.ForegroundColor, q.BackgroundColor = fg, bg
	return q.PNG(size)
}

// QRSVG renders the code as an SVG image.
func QRSVG(content string, size int, fg, bg string) (string, error) {
	q, err := qrcode.New(content, qrcode.Medium)
	if err != nil {
		return "", err
	}
	bits := q.Bitmap()
	n := len(bits)
	var path strings.Builder
	for y, row := range bits {
		for x := 0; x < n; x++ {
			if !row[x] {
				continue
			}
			start := x
			for x+1 < n && row[x+1] {
				x++
			}
			fmt.Fprintf(&path, "M%d %dh%dv1h-%dz", start, y, x-start+1, x-start+1)
		}
	}
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" shape-rendering="crispEdges"><rect width="%d" height="%d" fill="%s"/><path fill="%s" d="%s"/></svg>`+"\n",
		size, size, n, n, n, n, bg, fg, path.String()), nil
}
