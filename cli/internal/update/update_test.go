package update

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestNewer(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"1.10.0", "1.9.3", true},
		{"1.9.3", "1.10.0", false},
		{"2.0.0", "1.99.99", true},
		{"1.2.3", "1.2.3", false},
		{"v1.2.4", "1.2.3", true},
		{"1.2.4", "dev", false},
		{"1.2.4-rc1", "1.2.3", true},
		{"nonsense", "1.0.0", false},
	}
	for _, c := range cases {
		if got := Newer(c.a, c.b); got != c.want {
			t.Errorf("Newer(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestAssetName(t *testing.T) {
	if got := AssetName("windows", "amd64"); got != "hop_windows_amd64.zip" {
		t.Error(got)
	}
	if got := AssetName("linux", "arm64"); got != "hop_linux_arm64.tar.gz" {
		t.Error(got)
	}
}

func tarball(t *testing.T, name string, content []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o755, Size: int64(len(content)), Typeflag: tar.TypeReg}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(content); err != nil {
		t.Fatal(err)
	}
	tw.Close()
	gz.Close()
	return buf.Bytes()
}

func TestVerifyAndExtract(t *testing.T) {
	archive := tarball(t, "hop", []byte("new program"))
	sum := sha256.Sum256(archive)
	sums := []byte("0000  other.tar.gz\n" + hex.EncodeToString(sum[:]) + "  hop_linux_amd64.tar.gz\n")
	if err := verify(archive, sums, "hop_linux_amd64.tar.gz"); err != nil {
		t.Fatal(err)
	}
	if err := verify(append(archive, 'x'), sums, "hop_linux_amd64.tar.gz"); err == nil {
		t.Error("a changed archive must not pass")
	}
	if err := verify(archive, sums, "hop_darwin_arm64.tar.gz"); err == nil {
		t.Error("an archive without a checksum must not pass")
	}
	got, err := extract(archive, "hop_linux_amd64.tar.gz", "hop")
	if err != nil || string(got) != "new program" {
		t.Fatalf("extract = %q, %v", got, err)
	}
}

func TestReplace(t *testing.T) {
	exe := filepath.Join(t.TempDir(), "hop")
	if err := os.WriteFile(exe, []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := replace(exe, []byte("new")); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(exe)
	if string(got) != "new" {
		t.Errorf("program is %q", got)
	}
	left, _ := filepath.Glob(exe + ".*")
	if len(left) != 0 {
		t.Errorf("left behind: %v", left)
	}
}
