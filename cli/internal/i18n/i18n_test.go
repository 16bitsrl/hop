package i18n

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// sourceTexts collects every text passed to t(...) or i18n.T(...) in the commands and in the interface.
func sourceTexts(t *testing.T) []string {
	t.Helper()
	seen := map[string]bool{}
	files, err := filepath.Glob("../cmd/*.go")
	more, _ := filepath.Glob("../ui/*.go")
	files = append(files, more...)
	if err != nil || len(files) < 2 {
		t.Fatalf("no command sources found: %v", err)
	}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		fset := token.NewFileSet()
		parsed, err := parser.ParseFile(fset, file, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(parsed, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || len(call.Args) == 0 {
				return true
			}
			name := ""
			switch fn := call.Fun.(type) {
			case *ast.Ident:
				name = fn.Name
			case *ast.SelectorExpr:
				if pkg, ok := fn.X.(*ast.Ident); ok && pkg.Name == "i18n" {
					name = fn.Sel.Name
				}
			}
			if name != "t" && name != "T" {
				return true
			}
			lit, ok := call.Args[0].(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				t.Errorf("%s: the text passed to t() must be written out, so it can be translated", fset.Position(call.Pos()))
				return true
			}
			text, err := strconv.Unquote(lit.Value)
			if err != nil {
				t.Fatal(err)
			}
			seen[text] = true
			return true
		})
	}
	texts := make([]string, 0, len(seen))
	for text := range seen {
		texts = append(texts, text)
	}
	sort.Strings(texts)
	return texts
}

var verb = regexp.MustCompile(`%(\[\d+\])?[sdvq]`)

// verbs lists the arguments a text uses, in argument order: "%[2]s and %[1]d" gives [d s].
func verbs(text string) string {
	var out []string
	for i, m := range verb.FindAllStringSubmatch(text, -1) {
		pos := i + 1
		if m[1] != "" {
			pos, _ = strconv.Atoi(strings.Trim(m[1], "[]"))
		}
		for len(out) < pos {
			out = append(out, "")
		}
		out[pos-1] = m[0][len(m[0])-1:]
	}
	return strings.Join(out, " ")
}

func TestItalianIsComplete(t *testing.T) {
	texts := sourceTexts(t)
	var missing []string
	for _, text := range texts {
		if _, ok := italian[text]; !ok {
			missing = append(missing, text)
		}
	}
	if len(missing) > 0 {
		if out := os.Getenv("HOP_I18N_MISSING"); out != "" {
			var b strings.Builder
			for _, m := range missing {
				b.WriteString("\t")
				b.WriteString(strconv.Quote(m))
				b.WriteString(": \"\",\n")
			}
			_ = os.WriteFile(out, []byte(b.String()), 0o644)
		}
		t.Errorf("%d texts have no Italian translation, for example: %q", len(missing), missing[0])
	}
	used := map[string]bool{}
	for _, text := range texts {
		used[text] = true
	}
	for text := range italian {
		if !used[text] {
			t.Errorf("translated but no longer used: %q", text)
		}
	}
}

func TestItalianKeepsTheArguments(t *testing.T) {
	for en, it := range italian {
		if strings.TrimSpace(it) == "" {
			t.Errorf("empty translation for %q", en)
		}
		if verbs(en) != verbs(it) {
			t.Errorf("arguments differ:\n  en: %s\n  it: %s", en, it)
		}
	}
}

func TestItalianStyle(t *testing.T) {
	apostrophe := regexp.MustCompile(`(?i)\b(e|a|i|o|u)'(\s|$|[.,;:?!])`)
	for _, it := range italian {
		if strings.ContainsAny(it, "—–") {
			t.Errorf("no em or en dashes in Italian: %q", it)
		}
		if apostrophe.MatchString(it) {
			t.Errorf("use accented letters, not apostrophes: %q", it)
		}
	}
}

func TestLanguageChoice(t *testing.T) {
	for _, key := range []string{"HOP_LANG", "LC_ALL", "LC_MESSAGES", "LANG"} {
		t.Setenv(key, "")
	}
	Init("")
	if Lang() != "en" {
		t.Errorf("default language is %q", Lang())
	}
	t.Setenv("LANG", "it_IT.UTF-8")
	Init("")
	if Lang() != "it" {
		t.Errorf("LANG=it_IT.UTF-8 gives %q", Lang())
	}
	Init("en")
	if Lang() != "en" {
		t.Errorf("an explicit choice must win, got %q", Lang())
	}
	t.Setenv("LANG", "de_DE.UTF-8")
	Init("")
	if Lang() != "en" {
		t.Errorf("an unknown language falls back to English, got %q", Lang())
	}
}
