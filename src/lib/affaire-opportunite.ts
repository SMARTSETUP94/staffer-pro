/** Commercial history remains attached to the same affair after signature. */
export function hasOpportuniteTab(affaire: { phase: string; code_opportunite: string | null }): boolean {
  return affaire.phase === "opportunite" || Boolean(affaire.code_opportunite);
}