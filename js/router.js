export function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  return { page: parts[0] || "home", id: decodeURIComponent(parts[1] || "") };
}
export function navigate(path) {
  location.hash = `#/${path}`;
}
