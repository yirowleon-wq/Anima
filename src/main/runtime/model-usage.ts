import type { Completion } from '../provider';

/** Subscription token usage is not an account bill. No verified per-token
 * monetary tariff is available for this Luna connection, so cost stays unknown. */
export function usageCost(_usage: Completion['usage']): { usdMin: number; usdMax: number; pricingDate: string } | null {
  return null;
}
