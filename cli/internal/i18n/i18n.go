// Package i18n translates the texts of the command line app. English is the source language and
// doubles as the key: T("Signed in to %s", host). Other languages live in maps keyed by the English text.
package i18n

import (
	"fmt"
	"os"
	"strings"
)

// Languages lists what the app is translated into.
var Languages = []string{"en", "it"}

var lang = "en"

// Init picks the language: an explicit choice wins, then the environment, then the system.
func Init(preferred string) {
	lang = "en"
	for _, candidate := range []string{preferred, os.Getenv("HOP_LANG"), os.Getenv("LC_ALL"), os.Getenv("LC_MESSAGES"), os.Getenv("LANG"), systemLocale()} {
		if l := normalize(candidate); l != "" {
			lang = l
			return
		}
	}
}

// Lang is the language in use ("en" or "it").
func Lang() string { return lang }

// Known reports whether the app is translated into the language.
func Known(code string) bool { return normalize(code) != "" }

func normalize(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	if len(v) < 2 {
		return ""
	}
	for _, l := range Languages {
		if v == l || strings.HasPrefix(v, l+"_") || strings.HasPrefix(v, l+"-") || strings.HasPrefix(v, l+".") {
			return l
		}
	}
	return ""
}

// T translates a text and fills in its arguments (fmt verbs).
func T(text string, args ...any) string {
	if lang == "it" {
		if translated, ok := italian[text]; ok {
			text = translated
		}
	}
	if len(args) == 0 {
		return text
	}
	return fmt.Sprintf(text, args...)
}
