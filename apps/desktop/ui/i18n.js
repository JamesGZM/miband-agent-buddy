import { catalogs } from "./locales.js";

// Source strings are Traditional Chinese; other languages translate them.
// Backend messages arrive in the same source language and use the same catalog.
export const LANGUAGES = ["zh-Hans", "zh-Hant", "en"];
const LOCALES = { "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en-US" };
let current = "zh-Hant";

export function systemLanguage(tags) {
  for (const tag of tags || []) {
    const value = String(tag).toLowerCase();
    if (/^zh-(hant|tw|hk|mo)/.test(value)) return "zh-Hant";
    if (value.startsWith("zh")) return "zh-Hans";
    if (value.startsWith("en")) return "en";
  }
  return "en";
}
export function resolveLanguage(choice, tags) {
  return LANGUAGES.includes(choice) ? choice : systemLanguage(tags);
}
export function setLanguage(language) {
  current = LANGUAGES.includes(language) ? language : "zh-Hant";
  return current;
}
export const language = () => current;
export function t(text, vars) {
  const value = catalogs[current]?.[text] ?? text;
  return vars ? value.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : value;
}
// Same-day times show only the clock; older ones add the date.
export function formatTime(at, now = Date.now()) {
  const date = new Date(at),
    today = new Date(now);
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(LOCALES[current], {
    ...(sameDay ? {} : { month: "numeric", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
