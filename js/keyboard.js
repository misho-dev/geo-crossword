export const ALPHABET = "აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ";
// Standard Georgian QWERTY: uppercase Latin keys are distinct, not digraphs.
export const LATIN_MAP = Object.freeze({
  a: "ა",
  b: "ბ",
  g: "გ",
  d: "დ",
  e: "ე",
  v: "ვ",
  z: "ზ",
  T: "თ",
  i: "ი",
  k: "კ",
  l: "ლ",
  m: "მ",
  n: "ნ",
  o: "ო",
  p: "პ",
  J: "ჟ",
  r: "რ",
  s: "ს",
  t: "ტ",
  u: "უ",
  f: "ფ",
  q: "ქ",
  R: "ღ",
  y: "ყ",
  S: "შ",
  C: "ჩ",
  c: "ც",
  Z: "ძ",
  w: "წ",
  W: "ჭ",
  x: "ხ",
  j: "ჯ",
  h: "ჰ",
});
export function normalizeLetter(char, transliteration = false) {
  const normalized = char.normalize("NFC").toLowerCase();
  if ([...normalized].length === 1 && ALPHABET.includes(normalized))
    return normalized;
  return transliteration ? LATIN_MAP[char] || "" : "";
}
export function parseInput(text, transliteration = false) {
  return [...text.normalize("NFC")]
    .map((c) => normalizeLetter(c, transliteration))
    .filter(Boolean);
}
