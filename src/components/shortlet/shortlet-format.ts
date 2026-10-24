/** Presentation only. Shortlet records remain in NGN; no conversion is implied. */
export const shortletMoney = (minor: number) => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(minor / 100);

/** Date-only stay records are displayed without converting their operating day. */
export function shortletDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}
