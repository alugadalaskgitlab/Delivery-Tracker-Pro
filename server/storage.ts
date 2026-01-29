import {
  type User,
  type InsertUser,
  type Party,
  type InsertParty,
  type Dispatch,
  type InsertDispatch,
  type SiteToken,
  type InsertSiteToken,
  type PartySequence,
  type InsertPartySequence,
  type AppSetting,
  type InsertAppSetting,
  users,
  parties,
  dispatches,
  siteTokens,
  partySequences,
  appSettings,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";

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
  
  getDispatches(): Promise<Dispatch[]>;
  getDispatch(id: string): Promise<Dispatch | undefined>;
  getDispatchesByParty(partyId: string): Promise<Dispatch[]>;
  getDispatchesByCreator(userId: string): Promise<Dispatch[]>;
  createDispatch(dispatch: InsertDispatch): Promise<Dispatch>;
  updateDispatch(id: string, data: Partial<Dispatch>): Promise<Dispatch | undefined>;
  
  getSiteTokenByToken(token: string): Promise<SiteToken | undefined>;
  getSiteTokensByParty(partyId: string): Promise<SiteToken[]>;
  createSiteToken(token: InsertSiteToken): Promise<SiteToken>;
  deactivateSiteTokensByParty(partyId: string): Promise<void>;
  
  getPartySequence(partyId: string): Promise<PartySequence | undefined>;
  incrementPartySequence(partyId: string): Promise<number>;
  deletePartySequence(partyId: string): Promise<void>;
  
  getDispatchCountByParty(partyId: string): Promise<number>;
  deleteParty(id: string): Promise<boolean>;
  
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
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
    const newParty = result[0];
    await db.insert(partySequences).values({
      partyId: newParty.id,
      currentSeq: 0,
    });
    return newParty;
  }

  async updateParty(id: string, data: Partial<Party>): Promise<Party | undefined> {
    const result = await db.update(parties).set(data).where(eq(parties.id, id)).returning();
    return result[0];
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

  async getPartySequence(partyId: string): Promise<PartySequence | undefined> {
    const result = await db.select().from(partySequences).where(eq(partySequences.partyId, partyId)).limit(1);
    return result[0];
  }

  async incrementPartySequence(partyId: string): Promise<number> {
    const result = await db
      .update(partySequences)
      .set({
        currentSeq: sql`${partySequences.currentSeq} + 1`,
      })
      .where(eq(partySequences.partyId, partyId))
      .returning();
    
    if (result[0]) {
      return result[0].currentSeq;
    }
    
    const newSeq = await db.insert(partySequences).values({
      partyId,
      currentSeq: 1,
    }).returning();
    
    return newSeq[0].currentSeq;
  }

  async deletePartySequence(partyId: string): Promise<void> {
    await db.delete(partySequences).where(eq(partySequences.partyId, partyId));
  }

  async getDispatchCountByParty(partyId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(dispatches)
      .where(eq(dispatches.partyId, partyId));
    return Number(result[0]?.count || 0);
  }

  async deleteParty(id: string): Promise<boolean> {
    const result = await db.delete(parties).where(eq(parties.id, id)).returning();
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
}

export const storage = new DbStorage();
