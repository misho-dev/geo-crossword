import { statistics } from "./statistics.js";
export const ACHIEVEMENTS = [
  {
    id: "first",
    icon: "✦",
    title: "პირველი გამარჯვება",
    description: "ამოხსენით პირველი კროსვორდი.",
    test: (s) => s.completed >= 1,
  },
  {
    id: "flawless",
    icon: "◎",
    title: "უშეცდომოდ",
    description: "დაასრულეთ არასწორი შემოწმების გარეშე.",
    test: (_, d) => Object.values(d.puzzles).some((r) => r.flawless),
  },
  {
    id: "no-hints",
    icon: "◇",
    title: "დახმარების გარეშე",
    description: "ამოხსენით კროსვორდი მინიშნების გარეშე.",
    test: (s) => s.noHints > 0,
  },
  {
    id: "five",
    icon: "Ⅴ",
    title: "ხუთი კროსვორდი",
    description: "ამოხსენით 5 სხვადასხვა კროსვორდი.",
    test: (s) => s.completed >= 5,
  },
  {
    id: "twenty",
    icon: "✺",
    title: "მარათონელი",
    description: "ამოხსენით 20 სხვადასხვა კროსვორდი.",
    test: (s) => s.completed >= 20,
  },
  {
    id: "speed",
    icon: "ϟ",
    title: "სისწრაფის ოსტატი",
    description: "დაასრულეთ სირთულის დროით მიზანზე სწრაფად.",
    test: (_, d) => Object.values(d.puzzles).some((r) => r.fast),
  },
  {
    id: "streak",
    icon: "♧",
    title: "ერთგული მოთამაშე",
    description: "ითამაშეთ ზედიზედ 7 დღის განმავლობაში.",
    test: (s) => s.longest >= 7,
  },
];
export function unlockAchievements(data) {
  const stats = statistics(data);
  const valid = ACHIEVEMENTS.filter((a) => a.test(stats, data)).map(
    (a) => a.id,
  );
  const newly = valid.filter((id) => !data.achievements.includes(id));
  data.achievements = valid;
  return newly;
}
