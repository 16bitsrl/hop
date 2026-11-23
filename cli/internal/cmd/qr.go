package cmd

import (
	"encoding/json"
	"image/color"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/16bitsrl/hop/cli/internal/ui"
)

type jsonRaw = json.RawMessage

var hexColor = regexp.MustCompile(`^#?([0-9a-fA-F]{6})$`)

func parseColor(value string) (color.Color, string, error) {
	m := hexColor.FindStringSubmatch(strings.TrimSpace(value))
	if m == nil {
		return nil, "", usage(t("“%s” is not a colour. Write it like #0f7a5c.", value))
	}
	n, _ := strconv.ParseUint(m[1], 16, 32)
	return color.RGBA{R: uint8(n >> 16), G: uint8(n >> 8), B: uint8(n), A: 255}, "#" + strings.ToLower(m[1]), nil
}

func (a *app) qrCmd() *cobra.Command {
	var output, format, fg, bg string
	var size int
	cmd := &cobra.Command{
		Use:   "qr <link>",
		Short: t("Show or save the QR code of a link"),
		Long: t("Show the QR code of a link in the terminal, or save it as a PNG or SVG image.") + "\n\n" +
			linkRefHelp() + " " + t("Any other address works too: hop qr https://example.com"),
		Example: "hop qr spring\nhop qr spring -o spring.png --size 1024\nhop qr spring -o spring.svg --color #0f7a5c",
		Args:    exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			content := args[0]
			// A full address that is not a short link of this server is encoded as it is.
			isAddress := strings.HasPrefix(content, "http://") || strings.HasPrefix(content, "https://")
			if srv, err := a.connect(); err == nil {
				link, err := srv.findLink(cmd.Context(), content)
				if err == nil {
					content = link.ShortURL
				} else if !isAddress {
					return err
				}
			} else if !isAddress {
				return err
			}
			fgColor, fgHex, err := parseColor(fg)
			if err != nil {
				return err
			}
			bgColor, bgHex, err := parseColor(bg)
			if err != nil {
				return err
			}
			if format == "" && output != "" {
				format = strings.TrimPrefix(strings.ToLower(filepath.Ext(output)), ".")
			}
			if output == "" && format == "" {
				var code string
				if ui.Colors() {
					code, err = ui.QR(content)
				} else {
					code, err = ui.QRPlain(content)
				}
				if err != nil {
					return err
				}
				ui.Println()
				ui.Println(code)
				ui.Println()
				ui.Println("  " + ui.Accent.Render(content))
				ui.Println()
				return nil
			}
			if size < 64 || size > 4096 {
				return usage(t("The size goes from 64 to 4096 pixels."))
			}
			var data []byte
			switch format {
			case "png":
				data, err = ui.QRPNG(content, size, fgColor, bgColor)
			case "svg":
				var svg string
				svg, err = ui.QRSVG(content, size, fgHex, bgHex)
				data = []byte(svg)
			default:
				return usage(t("The image can be PNG or SVG: name the file .png or .svg, or use --format."))
			}
			if err != nil {
				return err
			}
			if output == "" || output == "-" {
				_, err := os.Stdout.Write(data)
				return err
			}
			if err := os.WriteFile(output, data, 0o644); err != nil {
				return fail(t("The file could not be written: %s", err.Error()))
			}
			ui.Success(t("QR code of %s saved to %s", content, output))
			return nil
		},
	}
	f := cmd.Flags()
	f.StringVarP(&output, "output", "o", "", t("Save the image to this file (.png or .svg) instead of showing it"))
	f.StringVar(&format, "format", "", t("Image format when it can't be told from the file name: png or svg"))
	f.IntVar(&size, "size", 512, t("Width of the image in pixels"))
	f.StringVar(&fg, "color", "#000000", t("Colour of the code"))
	f.StringVar(&bg, "background", "#ffffff", t("Colour behind the code"))
	return cmd
}
