const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const fullFmt = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/New_York',
});

/** "nov 18": everything lowercase in tone */
export const shortDate = (d: Date) => dateFmt.format(d).toLowerCase();
/** "november 18, 2026" */
export const longDate = (d: Date) => fullFmt.format(d).toLowerCase();
export const yearOf = (d: Date) =>
  Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/New_York' }).format(d));
export const pad2 = (n: number) => String(n).padStart(2, '0');
