// Package update finds new releases of the app on GitHub and replaces the running program with them.
package update

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	// Repo hosts the releases. The app is released with tags like "cli-v1.2.3".
	Repo      = "16bitsrl/hop"
	TagPrefix = "cli-v"
)

// Release is a published version that fits this computer.
type Release struct {
	Version      string
	AssetName    string
	AssetURL     string
	ChecksumsURL string
}

// ErrNoRelease means nothing has been published for this system yet.
var ErrNoRelease = errors.New("no release")

func releasesURL() string {
	if u := os.Getenv("HOP_UPDATE_API"); u != "" {
		return u
	}
	return "https://api.github.com/repos/" + Repo + "/releases?per_page=30"
}

// AssetName is the archive of a release for a system: hop_darwin_arm64.tar.gz, hop_windows_amd64.zip.
func AssetName(goos, goarch string) string {
	ext := ".tar.gz"
	if goos == "windows" {
		ext = ".zip"
	}
	return "hop_" + goos + "_" + goarch + ext
}

func get(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "hop-cli")
	req.Header.Set("Accept", "application/vnd.github+json, application/octet-stream")
	res, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: HTTP %d", url, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, 200<<20))
}

// Latest returns the newest release that has a download for this system.
func Latest(ctx context.Context) (*Release, error) {
	data, err := get(ctx, releasesURL())
	if err != nil {
		return nil, err
	}
	var releases []struct {
		TagName    string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.Unmarshal(data, &releases); err != nil {
		return nil, err
	}
	want := AssetName(runtime.GOOS, runtime.GOARCH)
	var best *Release
	for _, r := range releases {
		if r.Draft || r.Prerelease || !strings.HasPrefix(r.TagName, TagPrefix) {
			continue
		}
		rel := &Release{Version: strings.TrimPrefix(r.TagName, TagPrefix), AssetName: want}
		for _, a := range r.Assets {
			switch a.Name {
			case want:
				rel.AssetURL = a.URL
			case "checksums.txt":
				rel.ChecksumsURL = a.URL
			}
		}
		if rel.AssetURL == "" || rel.ChecksumsURL == "" {
			continue
		}
		if best == nil || Newer(rel.Version, best.Version) {
			best = rel
		}
	}
	if best == nil {
		return nil, ErrNoRelease
	}
	return best, nil
}

// Newer reports whether version a comes after version b ("1.10.0" after "1.9.3").
// A development build ("dev") is never older than a release.
func Newer(a, b string) bool {
	pa, okA := parse(a)
	pb, okB := parse(b)
	if !okA {
		return false
	}
	if !okB {
		return false
	}
	for i := range pa {
		if pa[i] != pb[i] {
			return pa[i] > pb[i]
		}
	}
	return false
}

func parse(v string) ([3]int, bool) {
	var out [3]int
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return out, false
		}
		out[i] = n
	}
	return out, true
}

// Apply downloads the release, checks it against the published checksum and puts it in place of
// the running program. The new version runs from the next start.
func Apply(ctx context.Context, rel *Release) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	archive, err := get(ctx, rel.AssetURL)
	if err != nil {
		return err
	}
	sums, err := get(ctx, rel.ChecksumsURL)
	if err != nil {
		return err
	}
	if err := verify(archive, sums, rel.AssetName); err != nil {
		return err
	}
	name := "hop"
	if runtime.GOOS == "windows" {
		name = "hop.exe"
	}
	binary, err := extract(archive, rel.AssetName, name)
	if err != nil {
		return err
	}
	return replace(exe, binary)
}

func verify(archive, sums []byte, name string) error {
	sum := sha256.Sum256(archive)
	got := hex.EncodeToString(sum[:])
	for _, line := range strings.Split(string(sums), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && strings.TrimPrefix(fields[1], "*") == name {
			if strings.EqualFold(fields[0], got) {
				return nil
			}
			return fmt.Errorf("checksum mismatch for %s", name)
		}
	}
	return fmt.Errorf("no checksum published for %s", name)
}

func extract(archive []byte, archiveName, binary string) ([]byte, error) {
	if strings.HasSuffix(archiveName, ".zip") {
		zr, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
		if err != nil {
			return nil, err
		}
		for _, f := range zr.File {
			if filepath.Base(f.Name) == binary {
				rc, err := f.Open()
				if err != nil {
					return nil, err
				}
				defer rc.Close()
				return io.ReadAll(rc)
			}
		}
		return nil, fmt.Errorf("%s not found in %s", binary, archiveName)
	}
	gz, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return nil, err
	}
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return nil, fmt.Errorf("%s not found in %s", binary, archiveName)
		}
		if err != nil {
			return nil, err
		}
		if h.Typeflag == tar.TypeReg && filepath.Base(h.Name) == binary {
			return io.ReadAll(tr)
		}
	}
}

// replace swaps the program file. The new one is first written whole beside it, so a failure at
// any point leaves a working program in place.
func replace(exe string, binary []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(exe), filepath.Base(exe)+".*.new")
	if err != nil {
		return err
	}
	next := tmp.Name()
	_, err = tmp.Write(binary)
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Chmod(next, 0o755)
	}
	if err != nil {
		_ = os.Remove(next)
		return err
	}
	if runtime.GOOS != "windows" {
		// One step: the name points at the old program or at the new one, never at nothing.
		if err := os.Rename(next, exe); err != nil {
			_ = os.Remove(next)
			return err
		}
		return nil
	}
	// Windows does not allow replacing a program while it runs, but it allows renaming it away.
	old := exe + oldSuffix
	_ = os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		_ = os.Remove(next)
		return err
	}
	if err := os.Rename(next, exe); err != nil {
		_ = os.Rename(old, exe)
		_ = os.Remove(next)
		return err
	}
	_ = os.Remove(old) // fails while the old program runs: CleanUp removes it at the next start
	return nil
}

// oldSuffix marks the program an update on Windows moved out of the way.
const oldSuffix = ".hop-old"

// CleanUp removes what an earlier update on Windows left behind.
func CleanUp() {
	if runtime.GOOS != "windows" {
		return
	}
	if exe, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			exe = resolved
		}
		_ = os.Remove(exe + oldSuffix)
	}
}
