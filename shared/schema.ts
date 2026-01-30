import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const parties = pgTable("parties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyName: text("party_name").notNull(),
  partyCode: text("party_code").notNull().unique(),
  address: text("address"),
  gstNo: text("gst_no"),
  panNo: text("pan_no"),
  status: text("status").notNull(),
  accessId: text("access_id").notNull().unique(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const partyCodeSequence = pgTable("party_code_sequence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  currentSeq: integer("current_seq").notNull().default(0),
});

export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyId: varchar("party_id").notNull().references(() => parties.id, { onDelete: "cascade" }),
  siteCode: text("site_code").notNull(),
  siteName: text("site_name").notNull(),
  mixType: text("mix_type").notNull().default("DBM"),
  orderedMT: numeric("ordered_mt", { precision: 10, scale: 2 }).notNull().default("0"),
  accessId: text("access_id").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const siteSequences = pgTable("site_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyId: varchar("party_id").notNull().references(() => parties.id).unique(),
  currentSeq: integer("current_seq").notNull().default(0),
});

export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
});

export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;

export const insertPartySchema = createInsertSchema(parties).omit({
  id: true,
  createdAt: true,
});

export type InsertParty = z.infer<typeof insertPartySchema>;
export type Party = typeof parties.$inferSelect;

export const dispatches = pgTable("dispatches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challanNo: text("challan_no").notNull().unique(),
  partyId: varchar("party_id").notNull().references(() => parties.id),
  partyName: text("party_name").notNull(),
  partyCode: text("party_code").notNull(),
  siteId: varchar("site_id").references(() => sites.id),
  siteCode: text("site_code"),
  siteName: text("site_name").notNull(),
  mixType: text("mix_type"),
  vehicleNo: text("vehicle_no").notNull(),
  loadMT: numeric("load_mt", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  status: text("status").notNull(),
  arrivedAt: timestamp("arrived_at"),
  leftAt: timestamp("left_at"),
  arrivedByName: text("arrived_by_name"),
  leftByName: text("left_by_name"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertDispatchSchema = createInsertSchema(dispatches).omit({
  id: true,
  createdAt: true,
});

export type InsertDispatch = z.infer<typeof insertDispatchSchema>;
export type Dispatch = typeof dispatches.$inferSelect;

export const siteTokens = pgTable("site_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyId: varchar("party_id").notNull().references(() => parties.id),
  token: text("token").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSiteTokenSchema = createInsertSchema(siteTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertSiteToken = z.infer<typeof insertSiteTokenSchema>;
export type SiteToken = typeof siteTokens.$inferSelect;

export const challanSequences = pgTable("challan_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull().references(() => sites.id).unique(),
  currentSeq: integer("current_seq").notNull().default(0),
});

export const insertChallanSequenceSchema = createInsertSchema(challanSequences).omit({
  id: true,
});

export type InsertChallanSequence = z.infer<typeof insertChallanSequenceSchema>;
export type ChallanSequence = typeof challanSequences.$inferSelect;

export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppSettingSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type AppSetting = typeof appSettings.$inferSelect;
