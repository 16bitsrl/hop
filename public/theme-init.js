// Applies the saved theme before the first paint to avoid a flash. Kept as a file (not inline) so the
// content security policy can stay strict.
(function () {
  var t = localStorage.getItem("hop-theme") || "system";
  var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
})();
