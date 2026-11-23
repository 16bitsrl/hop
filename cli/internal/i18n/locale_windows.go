//go:build windows

package i18n

import (
	"syscall"
	"unsafe"
)

// systemLocale asks Windows for the user's language ("it-IT"): there is no LANG variable there.
func systemLocale() string {
	proc := syscall.NewLazyDLL("kernel32.dll").NewProc("GetUserDefaultLocaleName")
	buf := make([]uint16, 85)
	n, _, _ := proc.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if n == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}
