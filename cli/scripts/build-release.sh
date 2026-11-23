#!/bin/sh
# Builds the archives of a release of the command line app, one per system, plus checksums.txt.
#
#   cli/scripts/build-release.sh 1.2.3 [output folder]
#
# The names are what install.sh, install.ps1 and `hop update` look for:
# hop_<os>_<arch>.tar.gz (hop_windows_<arch>.zip on Windows).
set -eu

version="${1:?usage: build-release.sh <version> [output folder]}"
out="${2:-dist}"
cd "$(dirname "$0")/.."

mkdir -p "$out"
out=$(cd "$out" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

for target in darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64 windows/arm64; do
  os=${target%/*}
  arch=${target#*/}
  bin=hop
  [ "$os" = windows ] && bin=hop.exe
  dir="$work/${os}_${arch}"
  mkdir -p "$dir"
  CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath -ldflags "-s -w -X main.version=$version" -o "$dir/$bin" .
  if [ "$os" = windows ]; then
    (cd "$dir" && zip -q -j "$out/hop_${os}_${arch}.zip" "$bin")
  else
    tar -czf "$out/hop_${os}_${arch}.tar.gz" -C "$dir" "$bin"
  fi
  echo "built hop_${os}_${arch}"
done

cd "$out"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum hop_* > checksums.txt
else
  shasum -a 256 hop_* > checksums.txt
fi
echo "checksums written to $out/checksums.txt"
