export const key = (r, c) => `${r},${c}`;
export const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const formatTime = (seconds) => {
  const s = Math.floor(seconds || 0);
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
export const dateKey = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const value = (type) => parts.find((p) => p.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};
export const georgianDate = (d = new Date()) => {
  const [year, month, day] = dateKey(d).split("-").map(Number);
  return `${day} ${["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"][month - 1]}, ${year}`;
};
export const bounded = (n, max = 1e9) =>
  Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
export const difficultyName = (d) =>
  ({ easy: "მარტივი", medium: "საშუალო", hard: "რთული" })[d] || "საშუალო";
export const dayNumber = (date) =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
