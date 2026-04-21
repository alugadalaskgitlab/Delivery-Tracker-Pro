import {
  type User,
  type InsertUser,
  type Party,
  type InsertParty,
  type Site,
  type InsertSite,
  type Dispatch,
  type InsertDispatch,
  type SiteToken,
  type InsertSiteToken,
  type ChallanSequence,
  type InsertChallanSequence,
  type AppSetting,
  type InsertAppSetting,
  type PushSubscription,
  type InsertPushSubscription,
  users,
  parties,
  sites,
  dispatches,
  siteTokens,
  challanSequences,
  partyCodeSequence,
  siteSequences,
  appSettings,
  pushSubscriptions,
} from "@shared/schema";
import { db } from "../db";
import { eq, ne, and, or, desc, sql, isNull } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getParties(): Promise<Party[]>;
  getParty(id: string): Promise<Party | undefined>;
  getPartyByCode(code: string): Promise<Party | undefined>;
  getPartyByAccessId(accessId: string): Promise<Party | undefined>;
  createParty(party: InsertParty): Promise<Party>;
  updateParty(id: string, data: Partial<Party>): Promise<Party | undefined>;
  
  getSitesByParty(partyId: string): Promise<Site[]>;
  getAllSites(): Promise<Site[]>;
  getSite(id: string): Promise<Site | undefined>;
  getSiteByAccessId(accessId: string): Promise<Site | undefined>;
  createSite(site: InsertSite): Promise<Site>;
  updateSite(id: string, data: Partial<Pick<Site, 'siteName' | 'siteCode' | 'mixType' | 'orderedMT' | 'status' | 'accessId' | 'notifyMobile'>>): Promise<Site | undefined>;
  deleteSite(id: string): Promise<boolean>;
  
  getDispatches(): Promise<Dispatch[]>;
  getDispatch(id: string): Promise<Dispatch | undefined>;
  getDispatchesByParty(partyId: string): Promise<Dispatch[]>;
  getDispatchesBySite(siteId: string): Promise<Dispatch[]>;
  getDispatchesByCreator(userId: string): Promise<Dispatch[]>;
  createDispatch(dispatch: InsertDispatch): Promise<Dispatch>;
  updateDispatch(id: string, data: Partial<Dispatch>): Promise<Dispatch | undefined>;
  
  getSiteTokenByToken(token: string): Promise<SiteToken | undefined>;
  getSiteTokensByParty(partyId: string): Promise<SiteToken[]>;
  createSiteToken(token: InsertSiteToken): Promise<SiteToken>;
  deactivateSiteTokensByParty(partyId: string): Promise<void>;
  
  generatePartyCode(partyName: string): Promise<string>;
  generateSiteCode(partyCode: string, siteName: string): Promise<string>;
  getChallanSequence(siteId: string): Promise<ChallanSequence | undefined>;
  incrementChallanSequence(siteId: string): Promise<number>;
  deleteChallanSequence(siteId: string): Promise<void>;
  
  getDispatchCountByParty(partyId: string): Promise<number>;
  deleteParty(id: string): Promise<boolean>;
  deleteDispatch(id: string): Promise<boolean>;
  
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;

  savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  removePushSubscription(endpoint: string): Promise<boolean>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  getPushSubscriptionsBySiteId(siteId: string): Promise<PushSubscription[]>;
  getNonSitePushSubscriptions(): Promise<PushSubscription[]>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getParties(): Promise<Party[]> {
    return await db.select().from(parties).orderBy(desc(parties.createdAt));
  }

  async getParty(id: string): Promise<Party | undefined> {
    const result = await db.select().from(parties).where(eq(parties.id, id)).limit(1);
    return result[0];
  }

  async getPartyByCode(code: string): Promise<Party | undefined> {
    const result = await db.select().from(parties).where(eq(parties.partyCode, code)).limit(1);
    return result[0];
  }

  async getPartyByAccessId(accessId: string): Promise<Party | undefined> {
    const result = await db.select().from(parties).where(eq(parties.accessId, accessId)).limit(1);
    return result[0];
  }

  async createParty(party: InsertParty): Promise<Party> {
    const result = await db.insert(parties).values(party).returning();
    return result[0];
  }

  async updateParty(id: string, data: Partial<Party>): Promise<Party | undefined> {
    const result = await db.update(parties).set(data).where(eq(parties.id, id)).returning();
    return result[0];
  }

  async getSitesByParty(partyId: string): Promise<Site[]> {
    return await db.select().from(sites).where(eq(sites.partyId, partyId)).orderBy(desc(sites.createdAt));
  }

  async getAllSites(): Promise<Site[]> {
    return await db.select().from(sites).orderBy(desc(sites.createdAt));
  }

  async getSite(id: string): Promise<Site | undefined> {
    const result = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
    return result[0];
  }

  async getSiteByAccessId(accessId: string): Promise<Site | undefined> {
    const result = await db.select().from(sites).where(eq(sites.accessId, accessId)).limit(1);
    return result[0];
  }

  async createSite(site: InsertSite): Promise<Site> {
    const result = await db.insert(sites).values(site).returning();
    return result[0];
  }

  async updateSite(id: string, data: Partial<Pick<Site, 'siteName' | 'siteCode' | 'mixType' | 'orderedMT' | 'status' | 'accessId' | 'notifyMobile'>>): Promise<Site | undefined> {
    const result = await db.update(sites).set(data).where(eq(sites.id, id)).returning();
    return result[0];
  }

  async deleteSite(id: string): Promise<boolean> {
    const result = await db.delete(sites).where(eq(sites.id, id)).returning();
    return result.length > 0;
  }

  async getDispatches(): Promise<Dispatch[]> {
    return await db.select().from(dispatches).orderBy(desc(dispatches.createdAt));
  }

  async getDispatch(id: string): Promise<Dispatch | undefined> {
    const result = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
    return result[0];
  }

  async getDispatchesByParty(partyId: string): Promise<Dispatch[]> {
    return await db.select().from(dispatches).where(eq(dispatches.partyId, partyId)).orderBy(desc(dispatches.createdAt));
  }

  async getDispatchesBySite(siteId: string): Promise<Dispatch[]> {
    return await db.select().from(dispatches).where(eq(dispatches.siteId, siteId)).orderBy(desc(dispatches.createdAt));
  }

  async getDispatchesByCreator(userId: string): Promise<Dispatch[]> {
    return await db.select().from(dispatches).where(eq(dispatches.createdBy, userId)).orderBy(desc(dispatches.createdAt));
  }

  async createDispatch(dispatch: InsertDispatch): Promise<Dispatch> {
    const result = await db.insert(dispatches).values(dispatch).returning();
    return result[0];
  }

  async updateDispatch(id: string, data: Partial<Dispatch>): Promise<Dispatch | undefined> {
    const result = await db.update(dispatches).set(data).where(eq(dispatches.id, id)).returning();
    return result[0];
  }

  async getSiteTokenByToken(token: string): Promise<SiteToken | undefined> {
    const result = await db.select().from(siteTokens).where(eq(siteTokens.token, token)).limit(1);
    return result[0];
  }

  async getSiteTokensByParty(partyId: string): Promise<SiteToken[]> {
    return await db.select().from(siteTokens).where(eq(siteTokens.partyId, partyId));
  }

  async createSiteToken(token: InsertSiteToken): Promise<SiteToken> {
    const result = await db.insert(siteTokens).values(token).returning();
    return result[0];
  }

  async deactivateSiteTokensByParty(partyId: string): Promise<void> {
    await db.update(siteTokens).set({ active: false }).where(eq(siteTokens.partyId, partyId));
  }

  async generatePartyCode(partyName: string): Promise<string> {
    const words = partyName.toUpperCase().split(/\s+/).filter(w => w.length > 0);
    const baseCode = words.map(w => w[0]).join('');
    
    let code = baseCode;
    let counter = 1;
    while (await this.getPartyByCode(code)) {
      code = `${baseCode}${counter}`;
      counter++;
    }
    
    return code;
  }

  async generateSiteCode(partyCode: string, siteName: string): Promise<string> {
    const words = siteName.toUpperCase().split(/\s+/).filter(w => w.length > 0);
    const siteSuffix = words.map(w => w[0]).join('');
    
    let code = `${partyCode}-${siteSuffix}`;
    let counter = 1;
    const existingSites = await this.getAllSites();
    
    while (existingSites.some(s => s.siteCode === code)) {
      code = `${partyCode}-${siteSuffix}${counter}`;
      counter++;
    }
    
    return code;
  }

  async getChallanSequence(siteId: string): Promise<ChallanSequence | undefined> {
    const result = await db.select().from(challanSequences)
      .where(eq(challanSequences.siteId, siteId)).limit(1);
    return result[0];
  }

  async incrementChallanSequence(siteId: string): Promise<number> {
    const result = await db
      .update(challanSequences)
      .set({
        currentSeq: sql`${challanSequences.currentSeq} + 1`,
      })
      .where(eq(challanSequences.siteId, siteId))
      .returning();
    
    if (result[0]) {
      return result[0].currentSeq;
    }
    
    const newSeq = await db.insert(challanSequences).values({
      siteId,
      currentSeq: 1,
    }).returning();
    
    return newSeq[0].currentSeq;
  }

  async deleteChallanSequence(siteId: string): Promise<void> {
    await db.delete(challanSequences).where(eq(challanSequences.siteId, siteId));
  }

  async getDispatchCountByParty(partyId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(dispatches)
      .where(eq(dispatches.partyId, partyId));
    return Number(result[0]?.count || 0);
  }

  async deleteParty(id: string): Promise<boolean> {
    // First delete all sites belonging to this party
    await db.delete(sites).where(eq(sites.partyId, id));
    // Then delete the party
    const result = await db.delete(parties).where(eq(parties.id, id)).returning();
    return result.length > 0;
  }

  async deleteDispatch(id: string): Promise<boolean> {
    const result = await db.delete(dispatches).where(eq(dispatches.id, id)).returning();
    return result.length > 0;
  }

  async getSetting(key: string): Promise<string | undefined> {
    const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return result[0]?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value });
    }
  }

  async savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).limit(1);
    if (existing.length > 0) {
      const result = await db.update(pushSubscriptions)
        .set({ p256dh: sub.p256dh, auth: sub.auth, role: sub.role, siteId: sub.siteId })
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .returning();
      return result[0];
    }
    const result = await db.insert(pushSubscriptions).values(sub).returning();
    return result[0];
  }

  async removePushSubscription(endpoint: string): Promise<boolean> {
    const result = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).returning();
    return result.length > 0;
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions);
  }

  async getPushSubscriptionsBySiteId(siteId: string): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.siteId, siteId));
  }

  async getNonSitePushSubscriptions(): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions).where(
      or(ne(pushSubscriptions.role, "SITE"), isNull(pushSubscriptions.role))
    );
  }
}

export const storage = new DbStorage();
