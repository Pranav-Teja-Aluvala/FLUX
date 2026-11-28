const codes = (
  "af am ar as az ba be bg bn bo br bs ca cs cy da de el en es et eu fa fi fo fr gl gu ha haw he hi " +
  "hr ht hu hy id is it ja jw ka kk km kn ko la lb ln lo lt lv mg mi mk ml mn mr ms mt my ne nl nn " +
  "no oc pa pl ps pt ro ru sa sd si sk sl sn so sq sr su sv sw ta te tg th tk tl tr tt uk ur uz vi yi yo zh yue"
).split(" ");
const modelCodes = new Set(codes);
const names = new Intl.DisplayNames(["en"], { type: "language" });
const languageAliases: Record<string, string> = { jw: "jv" };
const labelOverrides: Record<string, string> = {
  ba: "Bashkir", bo: "Tibetan", zh: "Mandarin Chinese",
};

export const captionLanguages = codes.map((code) => ({
  code,
  name: labelOverrides[code] ?? names.of(languageAliases[code] ?? code) ?? code,
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

export function captionLanguage(value: string | null) {
  return value && modelCodes.has(value) ? value : "auto";
}

export function browserCaptionLocale(selection: string, browserLocale: string) {
  if (selection === "auto") return browserLocale || "en-US";
  const language = languageAliases[selection] ?? selection;
  const preferred = browserLocale ? new Intl.Locale(browserLocale) : undefined;
  if (preferred?.language === language) return preferred.toString();
  const locale = new Intl.Locale(language).maximize();
  return locale.region ? language + "-" + locale.region : language;
}
