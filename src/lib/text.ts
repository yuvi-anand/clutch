// Date-phrase helpers shared by the server (dashboard) and the browser.
// Month and weekday names are matched as whole words, so "Decorator 3" is not
// read as "Dec 3" and "Monitoring" doesn't lose its "Mon".

const WEEKDAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)";
const MONTH =
  "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)";

const EVENT = new RegExp(
  String.raw`\b((?:mid-?term|final)(?:\s+exam)?(?:\s*#?\s*\d)?|exam(?:\s*#?\s*\d)?|quiz(?:\s*#?\s*\d+)?|(?:in[- ]person\s+)?lab(?:\s*#?\s*\d+)?|practical(?:\s*#?\s*\d+)?|test\s*#?\s*\d+)\b([^.;\n]{0,50}?)\b(${MONTH})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b`,
  "gi",
);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Exams, quizzes and labs mentioned with a date, e.g. "Midterm 1 is on Thu, Oct 15". */
export function eventMentions(text: string): { label: string; month: number; day: number; snippet: string }[] {
  const out: { label: string; month: number; day: number; snippet: string }[] = [];
  for (const m of text.matchAll(EVENT)) {
    const month = MONTHS.indexOf(m[3].slice(0, 3).toLowerCase());
    const day = Number(m[4]);
    if (month < 0 || day < 1 || day > 31) continue;
    const label = m[1].trim().replace(/\s+/g, " ");
    out.push({ label: label[0].toUpperCase() + label.slice(1), month, day, snippet: m[0].trim() });
  }
  return out;
}

/** "3. Cryptography Quiz Next Week, Oct 06" -> "Cryptography Quiz" */
export function stripDates(raw: string): string {
  const t = raw
    .replace(/^\s*(\d+|[a-z])[.)]\s+/i, "")
    .replace(/\b(next|this)\s+week\b/gi, "")
    .replace(new RegExp(String.raw`\b${WEEKDAY}\b\.?,?`, "gi"), "")
    .replace(new RegExp(String.raw`\b${MONTH}\.?\s+\d{1,2}(st|nd|rd|th)?\b`, "gi"), "")
    .replace(/[\s,:–-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t || raw.trim();
}

/** Local-time YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-10-03" -> "Sat, Oct 3" */
export function fmtDateKey(key: string, withWeekday = true): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", withWeekday ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" });
}

/** "Sat, Oct 3" or "Oct 10–12" or "Oct 30 – Nov 2" */
export function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDateKey(start);
  const [, m1] = start.split("-");
  const [, m2, d2] = end.split("-");
  return m1 === m2 ? `${fmtDateKey(start, false)}–${Number(d2)}` : `${fmtDateKey(start, false)} – ${fmtDateKey(end, false)}`;
}
