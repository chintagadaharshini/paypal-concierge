// The guardrails every purchase passes through before a PayPal order is created. Pure functions, no
// I/O: the server runs them on its own price and category for the item, never on browser input
// (except `confirmed`, which records the buyer's own decision).

import type { SpendingRules } from './config';

export type RuleId = 'spend-limit' | 'confirmation' | 'blocked-category';

export type RuleResult = {
  id: RuleId;
  label: string;
  passed: boolean;
  /** One plain sentence saying why it passed or failed, for the "why" panel. */
  detail: string;
};

export type RuleCheck = { allowed: boolean; results: RuleResult[] };

export type Purchase = { name: string; price: string; currency: string; category: string };

// Money is compared in whole cents so 50.00 vs 49.999... never trips over floating point.
const cents = (value: string) => Math.round(Number(value) * 100);

export function checkPurchase(purchase: Purchase, { confirmed }: { confirmed: boolean }, rules: SpendingRules): RuleCheck {
  const results: RuleResult[] = [spendLimit(purchase, rules), confirmation(confirmed, rules), blockedCategory(purchase, rules)];
  return { allowed: results.every((r) => r.passed), results };
}

function spendLimit({ price, currency }: Purchase, rules: SpendingRules): RuleResult {
  const base = { id: 'spend-limit' as const, label: `Spend limit (${rules.spendLimit} ${rules.currency})` };
  if (currency !== rules.currency) {
    return { ...base, passed: false, detail: `Priced in ${currency}, but the limit is in ${rules.currency}, so it can't be checked.` };
  }
  const price_ = cents(price);
  if (!Number.isFinite(price_) || price_ <= 0) return { ...base, passed: false, detail: `The price ${price} ${currency} is not valid.` };
  return price_ <= cents(rules.spendLimit)
    ? { ...base, passed: true, detail: `${price} ${currency} is within the ${rules.spendLimit} ${rules.currency} limit.` }
    : { ...base, passed: false, detail: `${price} ${currency} is over the ${rules.spendLimit} ${rules.currency} limit.` };
}

function confirmation(confirmed: boolean, rules: SpendingRules): RuleResult {
  const base = { id: 'confirmation' as const, label: 'Confirm before paying' };
  if (!rules.requireConfirmation) return { ...base, passed: true, detail: 'Confirmation is not required.' };
  return confirmed
    ? { ...base, passed: true, detail: 'You confirmed this purchase.' }
    : { ...base, passed: false, detail: 'You have not confirmed this purchase yet.' };
}

function blockedCategory({ category }: Purchase, rules: SpendingRules): RuleResult {
  const base = { id: 'blocked-category' as const, label: 'Blocked categories' };
  const blocked = rules.blockedCategories.includes(category.trim().toLowerCase());
  return blocked
    ? { ...base, passed: false, detail: `"${category}" is a blocked category.` }
    : { ...base, passed: true, detail: `"${category}" is not a blocked category.` };
}
