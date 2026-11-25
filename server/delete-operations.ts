export type DeleteResult = { deleted: boolean; challanCount: number };

export function siteDeletionBlockedMessage(challanCount: number): string {
  return `This site has ${challanCount} challans and cannot be deleted. Make the party inactive instead.`;
}

export function partyDeletionBlockedMessage(challanCount: number): string {
  return `This party has ${challanCount} challans and cannot be deleted. Make it inactive instead.`;
}

export interface SiteDeleteOperations {
  countSiteChallans(siteId: string): Promise<number>;
  deleteSiteChallanSequences(siteId: string): Promise<void>;
  deleteSite(siteId: string): Promise<boolean>;
}

export interface PartyDeleteOperations {
  getPartySiteIds(partyId: string): Promise<string[]>;
  countPartyChallans(partyId: string): Promise<number>;
  deletePartySiteChallanSequences(siteIds: string[]): Promise<void>;
  deletePartySites(partyId: string): Promise<void>;
  deletePartySiteSequence(partyId: string): Promise<void>;
  deletePartyTokens(partyId: string): Promise<void>;
  deleteParty(partyId: string): Promise<boolean>;
}

export async function deleteSiteSafely(siteId: string, operations: SiteDeleteOperations): Promise<DeleteResult> {
  const challanCount = await operations.countSiteChallans(siteId);
  if (challanCount > 0) return { deleted: false, challanCount };

  await operations.deleteSiteChallanSequences(siteId);
  return { deleted: await operations.deleteSite(siteId), challanCount: 0 };
}

export async function deletePartySafely(partyId: string, operations: PartyDeleteOperations): Promise<DeleteResult> {
  const challanCount = await operations.countPartyChallans(partyId);
  if (challanCount > 0) return { deleted: false, challanCount };

  const siteIds = await operations.getPartySiteIds(partyId);
  await operations.deletePartySiteChallanSequences(siteIds);
  await operations.deletePartySites(partyId);
  await operations.deletePartySiteSequence(partyId);
  await operations.deletePartyTokens(partyId);
  return { deleted: await operations.deleteParty(partyId), challanCount: 0 };
}
