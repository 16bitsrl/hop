#!/bin/sh
# Installs hop, the command line app for the hop URL shortener, on macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/16bitsrl/hop/main/cli/install.sh | sh
#
# It downloads the program for your system from the latest release, checks it against the published
# checksum and puts it in ~/.local/bin. Run it again to update (or use `hop update`).
#
# Settings (environment variables):
#   HOP_INSTALL_DIR   where to put the program (default: ~/.local/bin)
#   HOP_VERSION       a version to install instead of the latest, like 1.2.3
set -eu

repo="16bitsrl/hop"
api="${HOP_UPDATE_API:-https://api.github.com/repos/$repo/releases?per_page=30}"
downloads="${HOP_DOWNLOAD_BASE:-https://github.com/$repo/releases/download}"
dir="${HOP_INSTALL_DIR:-$HOME/.local/bin}"

italian=false
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in it*) italian=true ;; esac
say() { if $italian; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
fail() { say "hop: $1" "hop: $2" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is needed to download hop." "per scaricare hop serve curl."
command -v tar >/dev/null 2>&1 || fail "tar is needed to unpack hop." "per estrarre hop serve tar."

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in
  darwin | linux) ;;
  *) fail "this installer is for macOS and Linux. On Windows use install.ps1." "questo installer è per macOS e Linux. Su Windows usa install.ps1." ;;
esac
arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) arch=amd64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) fail "this kind of computer is not supported: $arch" "questo tipo di computer non è supportato: $arch" ;;
esac

version="${HOP_VERSION:-}"
version="${version#v}"
if [ -z "$version" ]; then
  # Releases of the app are tagged cli-v1.2.3; the newest comes first in the list.
  version=$(curl -fsSL "$api" | grep -o '"tag_name": *"cli-v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"' | head -n 1 | sed 's/.*cli-v\([0-9.]*\)"/\1/') || true
  [ -n "$version" ] || fail "could not find the latest version. Check your connection and try again." "non trovo l'ultima versione. Controlla la connessione e riprova."
fi

asset="hop_${os}_${arch}.tar.gz"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

say "Downloading hop $version ($os/$arch)…" "Scarico hop $version ($os/$arch)…"
curl -fsSL "$downloads/cli-v$version/$asset" -o "$tmp/$asset" || fail "the download failed." "il download non è riuscito."
curl -fsSL "$downloads/cli-v$version/checksums.txt" -o "$tmp/checksums.txt" || fail "the download failed." "il download non è riuscito."

want=$(grep " $asset\$" "$tmp/checksums.txt" | awk '{print $1}')
if command -v sha256sum >/dev/null 2>&1; then
  got=$(sha256sum "$tmp/$asset" | awk '{print $1}')
else
  got=$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')
fi
[ -n "$want" ] && [ "$want" = "$got" ] || fail "the download does not match its checksum, so it was not installed." "il file scaricato non corrisponde al suo checksum, quindi non è stato installato."

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$dir"
# Replace in one step, so a running hop is never left half written.
mv -f "$tmp/hop" "$dir/hop.new"
chmod +x "$dir/hop.new"
mv -f "$dir/hop.new" "$dir/hop"

say "✓ hop $version is installed in $dir/hop" "✓ hop $version è installato in $dir/hop"
case ":$PATH:" in
  *":$dir:"*) ;;
  *)
    say "  $dir is not in your PATH yet. Add this line to your shell profile (~/.zshrc, ~/.bashrc…):" "  $dir non è ancora nel tuo PATH. Aggiungi questa riga al profilo della shell (~/.zshrc, ~/.bashrc…):"
    # shellcheck disable=SC2016
    printf '    export PATH="%s:$PATH"\n' "$dir"
    ;;
esac
say "  Next: hop login https://your-hop-address" "  Poi: hop login https://your-hop-address"
