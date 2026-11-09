export const PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    colorLimit: 3
  }),
  pro: Object.freeze({
    id: 'pro',
    colorLimit: 8,
    monthlyPriceTzs: 9900,
    yearlyPriceTzs: 118800
  })
});

export function colorLimitFor(plan) {
  if (!Object.hasOwn(PLANS, plan)) {
    throw new TypeError('Unknown Chroma plan.');
  }
  return PLANS[plan].colorLimit;
}

export function formatTzs(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new TypeError('A TZS price must be a non-negative integer.');
  }
  return `TZS ${amount.toLocaleString('en-TZ')}`;
}
