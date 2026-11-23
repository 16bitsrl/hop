package cmd

import (
	"testing"
	"time"

	"github.com/16bitsrl/hop/cli/internal/config"
)

var now = time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)

func TestParseWhen(t *testing.T) {
	cases := map[string]string{
		"12h":                       "2026-03-11T00:00:00Z",
		"7d":                        "2026-03-17T12:00:00Z",
		"2w":                        "2026-03-24T12:00:00Z",
		"2026-12-31":                "2026-12-31T23:59:59Z", // a day alone lasts until its end
		"2026-12-31 18:00":          "2026-12-31T18:00:00Z",
		"2026-12-31T18:00:00+02:00": "2026-12-31T16:00:00Z",
	}
	for input, want := range cases {
		got, err := parseWhen(input, now)
		if err != nil || got == nil {
			t.Errorf("parseWhen(%q) failed: %v", input, err)
			continue
		}
		if got.UTC().Format(time.RFC3339) != want {
			t.Errorf("parseWhen(%q) = %s, want %s", input, got.UTC().Format(time.RFC3339), want)
		}
	}
	for _, never := range []string{"never", "none", "NEVER"} {
		if got, err := parseWhen(never, now); err != nil || got != nil {
			t.Errorf("parseWhen(%q) = %v, %v; want no date", never, got, err)
		}
	}
	for _, bad := range []string{"", "soon", "0d", "-3d", "31/12/2026", "7x"} {
		if _, err := parseWhen(bad, now); err == nil {
			t.Errorf("parseWhen(%q) should be refused", bad)
		}
	}
}

func TestParsePeriod(t *testing.T) {
	cases := map[string]string{
		"24h": "2026-03-09T12:00:00Z",
		"7d":  "2026-03-03T12:00:00Z",
		"2w":  "2026-02-24T12:00:00Z",
		"12m": "2025-03-10T12:00:00Z",
		"1y":  "2025-03-10T12:00:00Z",
	}
	for input, want := range cases {
		got, err := parsePeriod(input, now)
		if err != nil || got.Format(time.RFC3339) != want {
			t.Errorf("parsePeriod(%q) = %s, %v; want %s", input, got.Format(time.RFC3339), err, want)
		}
	}
	if got, err := parsePeriod("all", now); err != nil || !got.IsZero() {
		t.Errorf("parsePeriod(all) = %v, %v", got, err)
	}
	for _, bad := range []string{"", "week", "0d", "d"} {
		if _, err := parsePeriod(bad, now); err == nil {
			t.Errorf("parsePeriod(%q) should be refused", bad)
		}
	}
}

func TestParseRule(t *testing.T) {
	r, err := parseRule("device=iOS,android country=it,fr lang=IT url=https://example.com/app?x=1 app=myapp://open")
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Devices) != 2 || r.Devices[0] != "ios" || r.Countries[0] != "IT" || r.Countries[1] != "FR" || r.Languages[0] != "it" {
		t.Errorf("conditions = %+v", r)
	}
	if r.URL != "https://example.com/app?x=1" || r.AppURL != "myapp://open" {
		t.Errorf("destinations = %+v", r)
	}
	for _, bad := range []string{"", "url=https://example.com", "device=ios", "device=ios colour=red url=https://example.com", "device url=https://example.com"} {
		if _, err := parseRule(bad); err == nil {
			t.Errorf("parseRule(%q) should be refused", bad)
		}
	}
}

func TestParseVariant(t *testing.T) {
	v, err := parseVariant("70:https://example.com/a")
	if err != nil || v.Weight != 70 || v.URL != "https://example.com/a" {
		t.Errorf("got %+v, %v", v, err)
	}
	v, err = parseVariant("https://example.com:8080/b")
	if err != nil || v.Weight != 1 || v.URL != "https://example.com:8080/b" {
		t.Errorf("an address alone gets an equal share: %+v, %v", v, err)
	}
	for _, bad := range []string{"0:https://example.com", "2000:https://example.com", "70:ftp://example.com", "example.com"} {
		if _, err := parseVariant(bad); err == nil {
			t.Errorf("parseVariant(%q) should be refused", bad)
		}
	}
}

func TestNormalizeServerURL(t *testing.T) {
	cases := map[string]string{
		"hop.example.com":               "https://hop.example.com",
		"https://Hop.Example.com/":      "https://hop.example.com",
		"https://hop.example.com/links": "https://hop.example.com",
		"http://hop.internal:8080":      "http://hop.internal:8080",
		"app.localhost:5173":            "http://app.localhost:5173",
		"localhost:3000":                "http://localhost:3000",
	}
	for input, want := range cases {
		if got, err := normalizeServerURL(input); err != nil || got != want {
			t.Errorf("normalizeServerURL(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	for _, bad := range []string{"", "ftp://hop.example.com", "https://"} {
		if _, err := normalizeServerURL(bad); err == nil {
			t.Errorf("normalizeServerURL(%q) should be refused", bad)
		}
	}
}

func TestParseColor(t *testing.T) {
	if _, hex, err := parseColor("0F7A5C"); err != nil || hex != "#0f7a5c" {
		t.Errorf("got %q, %v", hex, err)
	}
	for _, bad := range []string{"green", "#fff", "#12345g"} {
		if _, _, err := parseColor(bad); err == nil {
			t.Errorf("parseColor(%q) should be refused", bad)
		}
	}
}

func TestUpdateCheckIsDueOnceADay(t *testing.T) {
	if !checkDue(config.State{}, now) {
		t.Error("never checked: due")
	}
	if checkDue(config.State{UpdateCheckedAt: now.Add(-23 * time.Hour)}, now) {
		t.Error("checked 23 hours ago: not due")
	}
	if !checkDue(config.State{UpdateCheckedAt: now.Add(-25 * time.Hour)}, now) {
		t.Error("checked 25 hours ago: due")
	}
}
