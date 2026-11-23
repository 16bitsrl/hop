// hop is the command line app for hop, the self-hosted URL shortener.
package main

import (
	"os"

	"github.com/16bitsrl/hop/cli/internal/cmd"
)

// version is set at build time (-ldflags "-X main.version=1.2.3").
var version = "dev"

func main() {
	os.Exit(cmd.Run(version, os.Args[1:]))
}
