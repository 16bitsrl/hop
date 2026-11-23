package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func setup(t *testing.T) *Config {
	t.Helper()
	t.Setenv("HOP_CONFIG_DIR", t.TempDir())
	t.Setenv("HOP_NO_KEYRING", "1") // never touch the real keychain in tests
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestSaveAndLoad(t *testing.T) {
	c := setup(t)
	c.Servers["hop.example.com"] = &Server{URL: "https://hop.example.com", User: "Ada", Role: "admin"}
	c.SetToken("hop.example.com", "hop_secret")
	c.Default = "hop.example.com"
	c.Updates = "auto"
	if err := c.Save(); err != nil {
		t.Fatal(err)
	}
	again, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if again.Default != "hop.example.com" || again.Updates != "auto" || again.Token("hop.example.com") != "hop_secret" {
		t.Errorf("loaded %+v", again)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(filepath.Join(Dir(), "config.json"))
		if err != nil || info.Mode().Perm() != 0o600 {
			t.Errorf("the file holds a key: it must be readable by its owner only, got %v %v", info.Mode().Perm(), err)
		}
	}
}

func TestFind(t *testing.T) {
	c := setup(t)
	c.Servers["hop.example.com"] = &Server{URL: "https://hop.example.com"}
	c.Servers["hop.acme.test"] = &Server{URL: "https://hop.acme.test"}
	c.Servers["links.acme.test:8443"] = &Server{URL: "https://links.acme.test:8443"}
	cases := map[string]string{
		"hop.example.com":              "hop.example.com",
		"HOP.EXAMPLE.COM":              "hop.example.com",
		"https://hop.acme.test/":       "hop.acme.test",
		"example":                      "hop.example.com",
		"links":                        "links.acme.test:8443",
		"https://links.acme.test:8443": "links.acme.test:8443",
	}
	for ref, want := range cases {
		if got, _ := c.Find(ref); got != want {
			t.Errorf("Find(%q) = %q, want %q", ref, got, want)
		}
	}
	if got, candidates := c.Find("acme"); got != "" || len(candidates) != 2 {
		t.Errorf("an ambiguous name must not pick one: %q %v", got, candidates)
	}
	if got, candidates := c.Find("nowhere"); got != "" || len(candidates) != 0 {
		t.Errorf("unknown: %q %v", got, candidates)
	}
}

func TestRemoveMovesTheDefault(t *testing.T) {
	c := setup(t)
	c.Servers["a.test"] = &Server{URL: "https://a.test", Token: "hop_a"}
	c.Servers["b.test"] = &Server{URL: "https://b.test", Token: "hop_b"}
	c.Default = "a.test"
	c.Remove("a.test")
	if c.Default != "b.test" || c.Token("a.test") != "" {
		t.Errorf("default = %q", c.Default)
	}
	c.Remove("b.test")
	if c.Default != "" || len(c.Servers) != 0 {
		t.Errorf("after removing everything: %+v", c)
	}
}

func TestDirFollowsTheEnvironment(t *testing.T) {
	t.Setenv("HOP_CONFIG_DIR", "")
	t.Setenv("XDG_CONFIG_HOME", filepath.Join("x", "cfg"))
	if got := Dir(); got != filepath.Join("x", "cfg", "hop") {
		t.Errorf("Dir() = %q", got)
	}
	t.Setenv("XDG_CONFIG_HOME", "")
	if got := Dir(); !strings.HasSuffix(got, "hop") {
		t.Errorf("Dir() = %q", got)
	}
}
