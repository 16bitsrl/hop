package config

import (
	"os"
	"testing"
)

// Run by hand with HOP_TEST_REAL_KEYRING=1: stores, reads and removes a throwaway key in the real keychain.
func TestRealKeychain(t *testing.T) {
	if os.Getenv("HOP_TEST_REAL_KEYRING") == "" {
		t.Skip("touches the real keychain: set HOP_TEST_REAL_KEYRING=1 to run")
	}
	t.Setenv("HOP_CONFIG_DIR", t.TempDir())
	t.Setenv("HOP_NO_KEYRING", "")
	c, _ := Load()
	const name = "hop-cli-selftest.invalid"
	c.Servers[name] = &Server{URL: "https://" + name}
	c.SetToken(name, "hop_selftest")
	if c.Servers[name].Token != "" {
		t.Fatalf("the key went to the file, not the keychain")
	}
	if got := c.Token(name); got != "hop_selftest" {
		t.Fatalf("read back %q", got)
	}
	c.Remove(name)
	c.Servers[name] = &Server{URL: "https://" + name}
	if got := c.Token(name); got != "" {
		t.Fatalf("still there after removing: %q", got)
	}
}
