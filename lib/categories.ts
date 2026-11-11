// Maps a product to one of the blocked categories in the spending rules (lib/config.ts) when its
// Channel3 category (or, without one, its title) looks like one, e.g. "Liquor & Spirits" -> "alcohol".
// Deliberately simple keyword rules: the server decides, and the agent can only add a flag, never
// clear one. Accessories such as wine glasses or a glue gun are not matches.

type Matcher = { category: string; pattern: RegExp; unless?: RegExp };

// Drinkware, decor and clothing that name a blocked thing without being it.
const ACCESSORY =
  /\b(glass|glasses|opener|rack|holder|decanter|stopper|aerator|chiller|cooler|tumbler|mug|sign|poster|book|shirt|t-shirt|tee|socks|costume|candle|soap|scented|ornament|magnet|sticker)\b/i;

const MATCHERS: Matcher[] = [
  {
    category: 'alcohol',
    pattern:
      /\b(alcohol|alcoholic|liquor|liqueur|spirits|wines?|beers?|lager|ale|cider|whisk(?:e)?y|bourbon|scotch|vodka|gin|rum|tequila|mezcal|brandy|cognac|champagne|prosecco|sake|hard seltzer)\b/i,
    unless: ACCESSORY,
  },
  {
    category: 'tobacco',
    pattern: /\b(tobacco|cigars?|cigarettes?|cigarillos?|vapes?|vaping|e-cigarettes?|e-liquids?|nicotine|hookah|shisha|snus)\b/i,
    unless: ACCESSORY,
  },
  {
    category: 'weapons',
    pattern:
      /\b(weapons?|firearms?|handguns?|rifles?|shotguns?|pistols?|revolvers?|ammunition|ammo|crossbows?|brass knuckles|switchblades?|tasers?|stun guns?|swords?|machetes?|combat knife|tactical knife|throwing knives)\b|(?<!\b(?:glue|massage|heat|nerf|water|toy|nail|staple|spray|caulk|squirt|bubble|foam|paint|grease|tape|soldering|label|price|hot glue)\s)\bguns?\b/i,
    unless: /\b(nerf|toy|water|squirt|bubble|foam|massage|glue)\b/i,
  },
  {
    category: 'gambling',
    pattern: /\b(gambling|casino|lottery|lotto|slot machines?|poker chips|sports betting|betting|roulette|scratch[- ]offs?)\b/i,
  },
  {
    category: 'gift cards',
    pattern: /\b(gift ?cards?|giftcards?|e-?gift|gift certificates?|prepaid cards?|vouchers?)\b/i,
  },
];

/**
 * The blocked category a product falls into, or null. `categories` are its Channel3 category and
 * that category's parents, without the top level (a root like "Food, Beverages & Tobacco" would
 * otherwise flag every food item). Each text is checked on its own, so "Barware > Wine Glasses"
 * is not alcohol.
 */
export function blockedCategoryOf(title: string, categories: string[], blocked: string[]): string | null {
  // A product's category says what it is; its title often only mentions a theme ("Single Malt
  // Scotch Toothpicks", a book about cigars). So the title counts only when there is no category.
  const texts = categories.length ? categories : [title];
  for (const { category, pattern, unless } of MATCHERS) {
    if (!blocked.includes(category)) continue;
    if (texts.some((text) => pattern.test(text) && !unless?.test(text))) return category;
  }
  return null;
}
