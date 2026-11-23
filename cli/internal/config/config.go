// Package config keeps what the app remembers between runs: the servers you signed in to, which one
// is the default, and a few preferences. Keys go to the system keychain when there is one.
package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/zalando/go-keyring"
)

const keyringService = "hop-cli"

// Server is one hop installation you are signed in to.
type Server struct {
	URL   string `json:"url"`
	User  string `json:"user,omitempty"`
	Email string `json:"email,omitempty"`
	Role  string `json:"role,omitempty"`
	// OwnKey is true when the key was made by `hop login` in the browser, so it is this app's to
	// revoke; a key the person pasted with --token is theirs and is only forgotten.
	OwnKey bool `json:"ownKey,omitempty"`
	// Token is only written here when the system keychain is not available.
	Token string `json:"token,omitempty"`
}

// Config is the content of config.json.
type Config struct {
	Default string             `json:"default,omitempty"`
	Servers map[string]*Server `json:"servers"`
	// Language: "" follows the system.
	Language string `json:"language,omitempty"`
	// Updates: "notify" (default), "auto" or "off".
	Updates string `json:"updates,omitempty"`

	dir string
}

// State is what the app notes for itself (state.json), nothing a person edits.
type State struct {
	UpdateCheckedAt time.Time `json:"updateCheckedAt,omitzero"`
	LatestVersion   string    `json:"latestVersion,omitempty"`
}

// Dir is where the files live: $HOP_CONFIG_DIR, else $XDG_CONFIG_HOME/hop, else %AppData%\hop on
// Windows and ~/.config/hop elsewhere.
func Dir() string {
	if d := os.Getenv("HOP_CONFIG_DIR"); d != "" {
		return d
	}
	if d := os.Getenv("XDG_CONFIG_HOME"); d != "" {
		return filepath.Join(d, "hop")
	}
	if runtime.GOOS == "windows" {
		if d := os.Getenv("AppData"); d != "" {
			return filepath.Join(d, "hop")
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".hop"
	}
	return filepath.Join(home, ".config", "hop")
}

// Load reads the configuration; a missing file is an empty configuration.
func Load() (*Config, error) {
	c := &Config{Servers: map[string]*Server{}, dir: Dir()}
	data, err := os.ReadFile(filepath.Join(c.dir, "config.json"))
	if errors.Is(err, os.ErrNotExist) {
		return c, nil
	}
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal(data, c); err != nil {
		return c, err
	}
	if c.Servers == nil {
		c.Servers = map[string]*Server{}
	}
	return c, nil
}

// Save writes the configuration, readable only by its owner.
func (c *Config) Save() error { return writeJSON(filepath.Join(c.dir, "config.json"), c) }

// Path is the full path of config.json.
func (c *Config) Path() string { return filepath.Join(c.dir, "config.json") }

func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Names lists the known servers, sorted.
func (c *Config) Names() []string {
	names := make([]string, 0, len(c.Servers))
	for n := range c.Servers {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// Find resolves what a person typed to a server name: the exact name, its address, or a part of the
// name that only one server has. It returns the candidates when several match.
func (c *Config) Find(ref string) (name string, candidates []string) {
	ref = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(ref)), "/")
	if _, ok := c.Servers[ref]; ok {
		return ref, nil
	}
	for _, n := range c.Names() {
		if strings.EqualFold(strings.TrimSuffix(c.Servers[n].URL, "/"), ref) {
			return n, nil
		}
		if strings.Contains(n, ref) {
			candidates = append(candidates, n)
		}
	}
	if len(candidates) == 1 {
		return candidates[0], nil
	}
	return "", candidates
}

func keyringEnabled() bool { return os.Getenv("HOP_NO_KEYRING") == "" }

// withTimeout guards against a keychain that never answers (a locked session, a missing desktop bus).
func withTimeout[T any](run func() (T, error)) (T, error) {
	type result struct {
		v   T
		err error
	}
	ch := make(chan result, 1)
	go func() {
		v, err := run()
		ch <- result{v, err}
	}()
	select {
	case r := <-ch:
		return r.v, r.err
	case <-time.After(5 * time.Second):
		var zero T
		return zero, errors.New("keychain timeout")
	}
}

// SetToken stores the key of a server: in the keychain when possible, else in the config file.
func (c *Config) SetToken(name, token string) {
	s := c.Servers[name]
	if s == nil {
		return
	}
	s.Token = ""
	if keyringEnabled() {
		if _, err := withTimeout(func() (struct{}, error) { return struct{}{}, keyring.Set(keyringService, name, token) }); err == nil {
			return
		}
	}
	s.Token = token
}

// Token returns the key of a server, or "".
func (c *Config) Token(name string) string {
	s := c.Servers[name]
	if s == nil {
		return ""
	}
	if s.Token != "" {
		return s.Token
	}
	if keyringEnabled() {
		if t, err := withTimeout(func() (string, error) { return keyring.Get(keyringService, name) }); err == nil {
			return t
		}
	}
	return ""
}

// Remove forgets a server and its key. The default moves to another server when there is one.
func (c *Config) Remove(name string) {
	if keyringEnabled() {
		_, _ = withTimeout(func() (struct{}, error) { return struct{}{}, keyring.Delete(keyringService, name) })
	}
	delete(c.Servers, name)
	if c.Default == name {
		c.Default = ""
		if names := c.Names(); len(names) > 0 {
			c.Default = names[0]
		}
	}
}

// LoadState reads state.json; any problem gives an empty state.
func (c *Config) LoadState() State {
	var s State
	if data, err := os.ReadFile(filepath.Join(c.dir, "state.json")); err == nil {
		_ = json.Unmarshal(data, &s)
	}
	return s
}

// SaveState writes state.json.
func (c *Config) SaveState(s State) error { return writeJSON(filepath.Join(c.dir, "state.json"), s) }
