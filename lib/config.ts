// App-wide settings for the Concierge, in one place.

export type SpendingRules = {
  /** Most the agent may spend on one purchase, as a decimal string in `currency`. */
  spendLimit: string;
  currency: string;
  /** The buyer must explicitly confirm before PayPal is opened. */
  requireConfirmation: boolean;
  /** Product categories the agent may never buy (lower case). */
  blockedCategories: string[];
};

// The default rules for every visitor. Kept low so the demo can show a blocked payment.
export const DEFAULT_RULES: SpendingRules = {
  spendLimit: '50.00',
  currency: 'USD',
  requireConfirmation: true,
  blockedCategories: ['alcohol', 'tobacco', 'weapons', 'gambling', 'gift cards'],
};
