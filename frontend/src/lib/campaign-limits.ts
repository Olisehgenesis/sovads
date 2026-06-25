/**
 * Network-wide minimums for campaign budgets and CTA payouts.
 *
 * Set here so every entry point (UI form, edit modal, API endpoints) reads
 * the same numbers. Drafts are exempt \u2014 these only kick in when something
 * actually goes live (publish, paid CTA on a live task).
 */

/** Minimum budget required to publish a campaign on-chain, in G$. */
export const MIN_BUDGET_GS = 2000

/**
 * Minimum on-chain G$ payout for any single CTA completion. SovPoint-only
 * tasks (rewardGs = 0 / null) are unaffected \u2014 the floor only applies
 * when the advertiser is actually paying G$ for the action.
 */
export const MIN_CTA_REWARD_GS = 6
