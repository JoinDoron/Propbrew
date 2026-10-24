/** Display original minor units without exchange-rate assumptions or rounding away kobo. */
export function facilityMoney(minor: number, currency = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}
