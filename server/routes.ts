import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { hashPassword, verifyPassword, requireAuth, requireAdmin, requirePlantOrAdmin, requireRole, getCurrentUser } from "./auth";
import { insertPartySchema, insertDispatchSchema, type Dispatch, type Party, type Site } from "@shared/schema";
import { z } from "zod";
import { getVapidPublicKey, broadcastNotification, sendSiteNotification } from "./push-notifications";
import { triggerSiteNotification, resolveCredentials, sendTestSms } from "./sms-notifications";
import { auditSitePulseCall, limitSitePulseRequests, requireSitePulseKey } from "./sitepulse-security";
import { enqueueSitePulseStatus } from "./sitepulse-outbox";

let io: SocketIOServer;

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}


function randomToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  async function createDispatchAndNotify(input: {
    party: Party;
    site: Site;
    vehicleNo: string;
    loadMT: string | number;
    notes?: string | null;
    driverName?: string | null;
    driverMobile?: string | null;
    mixType?: string | null;
    externalRef?: string;
    externalSource?: string;
  }) {
    const { party, site, vehicleNo, loadMT, notes, driverName, driverMobile } = input;
    const normalizedVehicleNo = vehicleNo.toUpperCase();
    const normalizedDriverName = driverName?.trim() || null;
    const normalizedDriverMobile = driverMobile?.trim() || null;
    const nextSeq = await storage.incrementChallanSequence(site.id);
    const challanNo = `${site.siteCode}-${String(nextSeq).padStart(4, "0")}`;

    const dispatch = await storage.createDispatch({
      challanNo,
      partyId: party.id,
      partyName: party.partyName,
      partyCode: party.partyCode,
      siteId: site.id,
      siteCode: site.siteCode,
      siteName: site.siteName,
      mixType: input.mixType || site.mixType,
      vehicleNo: normalizedVehicleNo,
      driverName: normalizedDriverName,
      driverMobile: normalizedDriverMobile,
      loadMT: String(loadMT),
      status: "DISPATCHED",
      notes: notes?.toUpperCase() || null,
      createdBy: null,
      externalRef: input.externalRef ?? null,
      externalSource: input.externalSource ?? null,
    });

    io.emit("new-dispatch", {
      dispatch,
      partyName: party.partyName,
      partyCode: party.partyCode,
      siteName: site.siteName,
    });

    sendSiteNotification(site.id, {
      title: "🚛 New Dispatch Created",
      body: `${challanNo} - ${loadMT} MT to ${site.siteName}`,
      tag: `dispatch-${dispatch.id}`,
      data: { type: "new-dispatch", dispatchId: dispatch.id, url: `/site/${site.accessId}` },
    }).catch((err) => console.error("Push notification error:", err));

    if (site.notifyMobile) {
      triggerSiteNotification({
        event: "DISPATCHED",
        challanNo,
        siteName: site.siteName,
        vehicleNo: normalizedVehicleNo,
        driverName: normalizedDriverName,
        driverMobile: normalizedDriverMobile,
        loadMT: String(loadMT),
        notifyMobile: site.notifyMobile,
        timestamp: new Date(),
      }).catch((err) => console.error("[SMS] Dispatch notification error:", err));
    }

    return dispatch;
  }

  async function enqueueStatusCallback(dispatch: {
    externalSource?: string | null;
    externalRef?: string | null;
    challanNo: string;
  }, status: "ARRIVED" | "LEFT", at: Date, byName: string) {
    if (dispatch.externalSource !== "SITEPULSE" || !dispatch.externalRef) return;
    try {
      await enqueueSitePulseStatus({
        externalRef: dispatch.externalRef,
        challanNo: dispatch.challanNo,
        status,
        at,
        byName,
      });
    } catch (error) {
      console.error("[SitePulse outbox] Could not queue status callback:", error instanceof Error ? error.message : "Unknown error");
    }
  }

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  app.get("/api/manifest", (req: Request, res: Response) => {
    let path = (req.query.path as string) || "";

    if (!path) {
      const referer = req.headers.referer || req.headers.referrer || "";
      try {
        const refUrl = new URL(referer, `http://${req.headers.host}`);
        path = refUrl.pathname;
      } catch {
        path = "/";
      }
    }

    if (!path.startsWith("/")) path = "/";
    path = path.split("?")[0].split("#")[0];
    const isSitePage = path.startsWith("/site/") || path === "/site";

    const manifest: Record<string, unknown> = {
      name: isSitePage ? "DispatchPro Site" : "DispatchPro - Highlane Constructions",
      short_name: isSitePage ? "DP Site" : "DispatchPro",
      description: "Dispatch Management System for material and mix deliveries",
      start_url: path,
      scope: "/",
      display: "standalone",
      background_color: isSitePage ? "#2E7D32" : "#2B3E5C",
      theme_color: isSitePage ? "#2E7D32" : "#2B3E5C",
      orientation: "portrait-primary",
      icons: [
        {
          src: isSitePage ? "/site-icon-192.png" : "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: isSitePage ? "/site-icon-512.png" : "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    };

    if (isSitePage) {
      manifest.id = path;
    }

    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json(manifest);
  });

  app.post("/api/auth/pin-login", async (req: Request, res: Response) => {
    try {
      const { role, pin } = req.body;

      console.log(`[PIN Login] Attempt for role: ${role}, pin provided: ${pin}`);

      if (!role || !pin) {
        return res.status(400).json({ error: "Role and PIN required" });
      }

      if (role !== "ADMIN" && role !== "PLANT") {
        return res.status(400).json({ error: "Invalid role" });
      }

      const settingKey = role === "ADMIN" ? "admin_pin" : "plant_pin";
      const storedPin = await storage.getSetting(settingKey);

      console.log(`[PIN Login] Stored PIN for ${settingKey}: "${storedPin}", Provided PIN: "${pin}", Match: ${pin === storedPin}`);

      if (!storedPin) {
        return res.status(500).json({ error: "PIN not configured" });
      }

      if (pin !== storedPin) {
        return res.status(401).json({ error: "Invalid PIN" });
      }

      req.session.userId = `${role.toLowerCase()}_session`;
      req.session.role = role;

      return res.json({
        user: {
          id: req.session.userId,
          role: role,
          displayName: role === "ADMIN" ? "Administrator" : "Plant Operator",
        },
      });
    } catch (error) {
      console.error("PIN login error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/verify-owner-pin", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { pin } = req.body;

      if (!pin) {
        return res.status(400).json({ error: "PIN required" });
      }

      const storedPin = await storage.getSetting("owner_pin");

      if (!storedPin) {
        return res.status(500).json({ error: "Owner PIN not configured. Please set it in Settings." });
      }

      if (pin !== storedPin) {
        return res.status(401).json({ error: "Invalid Owner PIN" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Verify owner PIN error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/site-login", async (req: Request, res: Response) => {
    try {
      const { token: siteToken } = req.body;

      if (!siteToken) {
        return res.status(400).json({ error: "Token required" });
      }

      const token = await storage.getSiteTokenByToken(siteToken);
      if (!token || !token.active) {
        return res.status(401).json({ error: "Invalid or inactive token" });
      }
      
      const party = await storage.getParty(token.partyId);
      if (!party || party.status !== "ACTIVE") {
        return res.status(401).json({ error: "Access closed - party/order is not active" });
      }

      req.session.userId = `site_${token.id}`;
      req.session.role = "SITE";
      (req.session as any).partyId = party.id;
      (req.session as any).siteTokenId = token.id;

      return res.json({
        user: {
          id: req.session.userId,
          username: `Site: ${party.partyName}`,
          role: "SITE",
          displayName: party.partyName,
        },
        partyId: party.id,
      });
    } catch (error) {
      console.error("Site login error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/settings/:key", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const value = await storage.getSetting(key);
      return res.json({ key, value: value || null });
    } catch (error) {
      console.error("Get setting error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/settings/:key", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { value, ownerPin } = req.body;

      if (!value) {
        return res.status(400).json({ error: "Value required" });
      }

      // PIN changes require Owner PIN verification
      const pinKeys = ["admin_pin", "plant_pin", "owner_pin"];
      if (pinKeys.includes(key)) {
        if (!ownerPin) {
          return res.status(400).json({ error: "Owner PIN required to change PINs" });
        }

        const storedOwnerPin = await storage.getSetting("owner_pin");
        if (!storedOwnerPin) {
          return res.status(500).json({ error: "Owner PIN not configured" });
        }

        if (ownerPin !== storedOwnerPin) {
          return res.status(401).json({ error: "Invalid Owner PIN" });
        }
      }

      await storage.setSetting(key, value);
      return res.json({ key, value });
    } catch (error) {
      console.error("Set setting error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/sms/config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const [accountSid, authToken, fromNumber] = await Promise.all([
        storage.getSetting("twilio_account_sid"),
        storage.getSetting("twilio_auth_token"),
        storage.getSetting("twilio_from_number"),
      ]);
      return res.json({
        accountSid: accountSid || "",
        authTokenSet: !!authToken,
        fromNumber: fromNumber || "",
      });
    } catch (error) {
      console.error("Get SMS config error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/admin/sms/config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        accountSid: z.string().min(1, "Account SID required"),
        authToken: z.string().optional(),
        fromNumber: z.string().min(1, "From Number required"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { accountSid, authToken, fromNumber } = parsed.data;
      const saves: Promise<void>[] = [
        storage.setSetting("twilio_account_sid", accountSid.trim()),
        storage.setSetting("twilio_from_number", fromNumber.trim()),
      ];
      if (authToken && authToken.trim()) {
        saves.push(storage.setSetting("twilio_auth_token", authToken.trim()));
      }
      await Promise.all(saves);
      return res.json({ success: true });
    } catch (error) {
      console.error("Save SMS config error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/sms/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        toNumber: z.string().min(1, "Recipient number required"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { toNumber } = parsed.data;

      const creds = await resolveCredentials();
      if (!creds) {
        return res.status(400).json({
          error:
            "Twilio credentials are not configured. Please save your Account SID, Auth Token, and From Number first.",
        });
      }

      const result = await sendTestSms(creds, toNumber);
      if (result.success) {
        return res.json({ success: true, message: result.message });
      } else {
        return res.status(502).json({ success: false, error: result.message });
      }
    } catch (error) {
      console.error("SMS test error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.session.role === "SITE") {
        const partyId = (req.session as any).partyId;
        const party = await storage.getParty(partyId);
        return res.json({
          user: {
            id: req.session.userId,
            username: `Site: ${party?.partyName}`,
            role: "SITE",
            displayName: party?.partyName,
          },
          partyId: partyId,
        });
      }

      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          displayName: user.displayName,
        },
      });
    } catch (error) {
      console.error("Get user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/parties", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.session.role === "SITE") {
        const partyId = (req.session as any).partyId;
        const party = await storage.getParty(partyId);
        return res.json(party ? [party] : []);
      }

      const parties = await storage.getParties();
      return res.json(parties);
    } catch (error) {
      console.error("Get parties error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/parties", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { partyName, address, gstNo, panNo } = req.body;
      
      if (!partyName) {
        return res.status(400).json({ error: "Party name is required" });
      }

      const partyCode = await storage.generatePartyCode(partyName);
      const accessId = slugify(partyCode);

      const party = await storage.createParty({
        partyName: partyName.toUpperCase(),
        partyCode,
        address: address?.toUpperCase() || null,
        gstNo: gstNo?.toUpperCase() || null,
        panNo: panNo?.toUpperCase() || null,
        status: "ACTIVE",
        accessId,
        createdBy: null,
      });

      return res.json(party);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Create party error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/parties/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const currentParty = await storage.getParty(id);
      if (!currentParty) {
        return res.status(404).json({ error: "Party not found" });
      }

      const updateData = { ...req.body };
      
      if (req.body.status === "ACTIVE" && currentParty.status !== "ACTIVE") {
        updateData.accessId = randomToken();
        
        const sites = await storage.getSitesByParty(id);
        for (const site of sites) {
          await storage.updateSite(site.id, { accessId: randomToken() });
        }
      }
      
      const party = await storage.updateParty(id, updateData);

      if (req.body.status && req.body.status !== "ACTIVE") {
        await storage.deactivateSiteTokensByParty(id);
      }

      return res.json(party);
    } catch (error) {
      console.error("Update party error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/parties/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const partyId = Array.isArray(id) ? id[0] : id;
      const { ownerPin } = req.body;

      if (!ownerPin) {
        return res.status(400).json({ error: "Owner PIN required" });
      }

      const storedOwnerPin = await storage.getSetting("owner_pin");
      if (!storedOwnerPin) {
        return res.status(500).json({ error: "Owner PIN not configured. Please set it in Settings." });
      }

      if (ownerPin !== storedOwnerPin) {
        return res.status(401).json({ error: "Invalid Owner PIN" });
      }

      const dispatchCount = await storage.getDispatchCountByParty(partyId);
      if (dispatchCount > 0) {
        return res.status(400).json({ error: "Cannot delete party with existing dispatches" });
      }

      await storage.deactivateSiteTokensByParty(partyId);
      const deleted = await storage.deleteParty(partyId);

      if (!deleted) {
        return res.status(404).json({ error: "Party not found" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Delete party error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/parties/:id/generate-token", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const party = await storage.getParty(id);
      
      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }

      const token = randomToken();
      const siteToken = await storage.createSiteToken({
        partyId: id,
        token,
        active: true,
      });

      return res.json(siteToken);
    } catch (error) {
      console.error("Generate token error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/parties/:partyId/sites", requireAuth, async (req: Request, res: Response) => {
    try {
      const { partyId } = req.params;
      const sites = await storage.getSitesByParty(partyId);
      return res.json(sites);
    } catch (error) {
      console.error("Get sites error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/parties/:partyId/sites", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { partyId } = req.params;
      const { siteName, mixType, orderedMT, notifyMobile } = req.body;

      if (!siteName || typeof siteName !== "string" || siteName.trim().length === 0) {
        return res.status(400).json({ error: "Site name is required" });
      }

      const party = await storage.getParty(partyId);
      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }

      const siteCode = await storage.generateSiteCode(party.partyCode, siteName);
      const accessId = randomToken();
      
      const site = await storage.createSite({
        partyId,
        siteCode,
        siteName: siteName.trim().toUpperCase(),
        mixType: mixType?.toUpperCase() || "DBM",
        orderedMT: orderedMT || "0",
        accessId,
        notifyMobile: notifyMobile?.trim() || null,
      });

      return res.json(site);
    } catch (error) {
      console.error("Create site error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sites/all", requirePlantOrAdmin, async (req: Request, res: Response) => {
    try {
      const sites = await storage.getAllSites();
      return res.json(sites);
    } catch (error) {
      console.error("Get all sites error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/sites/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { ownerPin } = req.body;

      const storedOwnerPin = await storage.getSetting("owner_pin");
      if (ownerPin !== storedOwnerPin) {
        return res.status(403).json({ error: "Invalid owner PIN" });
      }

      const deleted = await storage.deleteSite(id);
      if (!deleted) {
        return res.status(404).json({ error: "Site not found" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Delete site error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/sites/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { ownerPin, siteName, siteCode, mixType, orderedMT, status, notifyMobile } = req.body;

      const storedOwnerPin = await storage.getSetting("owner_pin");
      if (ownerPin !== storedOwnerPin) {
        return res.status(403).json({ error: "Invalid owner PIN" });
      }

      const currentSite = await storage.getSite(id);
      if (!currentSite) {
        return res.status(404).json({ error: "Site not found" });
      }

      const updateData: { siteName?: string; siteCode?: string; mixType?: string; orderedMT?: string; status?: string; accessId?: string; notifyMobile?: string | null } = {};
      if (siteName !== undefined) updateData.siteName = siteName.toUpperCase();
      if (siteCode !== undefined) updateData.siteCode = siteCode.toUpperCase();
      if (mixType !== undefined) updateData.mixType = mixType.toUpperCase();
      if (orderedMT !== undefined) updateData.orderedMT = orderedMT;
      if (status !== undefined) updateData.status = status;
      if (notifyMobile !== undefined) updateData.notifyMobile = notifyMobile?.trim() || null;

      if (status === "ACTIVE" && currentSite.status !== "ACTIVE") {
        updateData.accessId = randomToken();
      }

      const updated = await storage.updateSite(id, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Site not found" });
      }

      return res.json(updated);
    } catch (error) {
      console.error("Update site error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sites/:siteId/next-challan", requirePlantOrAdmin, async (req: Request, res: Response) => {
    try {
      const { siteId } = req.params;
      
      const site = await storage.getSite(siteId);
      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }
      
      const party = await storage.getParty(site.partyId);
      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }
      
      const sequence = await storage.getChallanSequence(siteId);
      const nextSeq = sequence ? sequence.currentSeq + 1 : 1;
      const challanNo = `${site.siteCode}-${String(nextSeq).padStart(4, '0')}`;
      
      return res.json({ challanNo, nextSeq });
    } catch (error) {
      console.error("Get next challan error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dispatches", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.session.role === "SITE") {
        const partyId = (req.session as any).partyId;
        const dispatches = await storage.getDispatchesByParty(partyId);
        return res.json(dispatches);
      }

      if (req.session.role === "PLANT") {
        const dispatches = await storage.getDispatches();
        return res.json(dispatches);
      }

      const dispatches = await storage.getDispatches();
      return res.json(dispatches);
    } catch (error) {
      console.error("Get dispatches error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dispatches", requirePlantOrAdmin, async (req: Request, res: Response) => {
    try {
      const { partyId, siteId, vehicleNo, loadMT, notes, driverName, driverMobile } = req.body;
      
      if (!partyId || !siteId || !vehicleNo || !loadMT) {
        return res.status(400).json({ error: "Party, site, vehicle number and load are required" });
      }

      const party = await storage.getParty(partyId);
      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }

      if (party.status !== "ACTIVE") {
        return res.status(400).json({ error: "Party is not active" });
      }

      const site = await storage.getSite(siteId);
      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }

      const dispatch = await createDispatchAndNotify({
        party,
        site,
        vehicleNo,
        loadMT,
        notes,
        driverName,
        driverMobile,
      });

      return res.json(dispatch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Create dispatch error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const sitePulseMiddleware = [auditSitePulseCall, limitSitePulseRequests, requireSitePulseKey] as const;

  app.post("/api/integrations/sitepulse/dispatches", ...sitePulseMiddleware, async (req: Request, res: Response) => {
    const requestSchema = z.object({
      externalRef: z.string().trim().min(1).max(200),
      siteId: z.string().min(1),
      vehicleNo: z.string().trim().min(1).max(100),
      loadMT: z.coerce.number().positive().finite(),
      driverName: z.string().trim().max(200).optional(),
      driverMobile: z.string().trim().max(50).optional(),
      notes: z.string().max(2000).optional(),
      mixType: z.string().trim().max(100).optional(),
    }).strict();
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });

    try {
      const existing = await storage.getDispatchByExternalRef(parsed.data.externalRef);
      if (existing) return res.json({ id: existing.id, challanNo: existing.challanNo, status: existing.status });

      const site = await storage.getSite(parsed.data.siteId);
      if (!site) return res.status(404).json({ error: "Site not found" });
      if (site.status !== "ACTIVE") return res.status(400).json({ error: "Site is not active" });

      const party = await storage.getParty(site.partyId);
      if (!party) return res.status(404).json({ error: "Party not found" });
      if (party.status !== "ACTIVE") return res.status(400).json({ error: "Party is not active" });

      try {
        const dispatch = await createDispatchAndNotify({
          party,
          site,
          vehicleNo: parsed.data.vehicleNo,
          loadMT: String(parsed.data.loadMT),
          notes: parsed.data.notes,
          driverName: parsed.data.driverName,
          driverMobile: parsed.data.driverMobile,
          mixType: parsed.data.mixType,
          externalRef: parsed.data.externalRef,
          externalSource: "SITEPULSE",
        });
        return res.status(201).json({ id: dispatch.id, challanNo: dispatch.challanNo, status: dispatch.status });
      } catch (error: any) {
        if (error?.code === "23505") {
          const duplicate = await storage.getDispatchByExternalRef(parsed.data.externalRef);
          if (duplicate) return res.json({ id: duplicate.id, challanNo: duplicate.challanNo, status: duplicate.status });
        }
        throw error;
      }
    } catch (error) {
      console.error("[SitePulse integration] Create dispatch failed:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to create dispatch" });
    }
  });

  app.patch("/api/integrations/sitepulse/dispatches/:externalRef", ...sitePulseMiddleware, async (req: Request, res: Response) => {
    const externalRef = String(req.params.externalRef || "");
    const dispatch = await storage.getDispatchByExternalRef(externalRef);
    if (!dispatch) return res.status(404).json({ error: "Dispatch not found" });
    if (dispatch.status === "UNLOADED" || dispatch.status === "LEFT") {
      return res.status(409).json({ error: "Dispatch cannot be changed after it has been marked LEFT" });
    }

    const cancelSchema = z.object({ cancelled: z.literal(true) }).strict();
    const cancel = cancelSchema.safeParse(req.body);
    if (cancel.success) {
      if (!dispatch.siteId) return res.status(409).json({ error: "Dispatch has no linked site" });
      const updated = await storage.updateDispatch(dispatch.id, { status: "CANCELLED" });
      const site = await storage.getSite(dispatch.siteId);
      io.emit("dispatch-status-updated", {
        dispatch: updated,
        partyName: dispatch.partyName,
        partyCode: dispatch.partyCode,
        newStatus: "CANCELLED",
      });
      if (site) {
        sendSiteNotification(site.id, {
          title: "Dispatch Cancelled",
          body: `Challan ${dispatch.challanNo} cancelled`,
          tag: `cancelled-${dispatch.id}`,
          data: { type: "cancelled", dispatchId: dispatch.id, url: `/site/${site.accessId}` },
        }).catch((err) => console.error("[SitePulse integration] Cancellation push failed:", err instanceof Error ? err.message : "Unknown error"));
      }
      return res.json({ id: updated?.id, challanNo: updated?.challanNo, status: updated?.status });
    }

    const updateSchema = z.object({
      vehicleNo: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()).optional(),
      loadMT: z.coerce.number().positive().finite().optional(),
      driverName: z.string().trim().max(200).nullable().optional(),
      driverMobile: z.string().trim().max(50).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "At least one editable field is required");
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid update" });

    try {
      const changes: Partial<Dispatch> = {};
      if (parsed.data.vehicleNo !== undefined) changes.vehicleNo = parsed.data.vehicleNo;
      if (parsed.data.loadMT !== undefined) changes.loadMT = String(parsed.data.loadMT);
      if (parsed.data.driverName !== undefined) changes.driverName = parsed.data.driverName;
      if (parsed.data.driverMobile !== undefined) changes.driverMobile = parsed.data.driverMobile;
      if (parsed.data.notes !== undefined) changes.notes = parsed.data.notes;
      const updated = await storage.updateDispatch(dispatch.id, changes);
      return res.json({ id: updated?.id, challanNo: updated?.challanNo, status: updated?.status });
    } catch (error) {
      console.error("[SitePulse integration] Update dispatch failed:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to update dispatch" });
    }
  });

  app.get("/api/integrations/sitepulse/sites", ...sitePulseMiddleware, async (_req: Request, res: Response) => {
    try {
      const activeParties = (await storage.getParties()).filter((party) => party.status === "ACTIVE");
      const allSites = await storage.getAllSites();
      const activePartyIds = new Set(activeParties.map((party) => party.id));
      const activeSites = allSites.filter((site) => site.status === "ACTIVE" && activePartyIds.has(site.partyId));
      const partyById = new Map(activeParties.map((party) => [party.id, party]));
      return res.json(activeSites.map((site) => {
        const party = partyById.get(site.partyId)!;
        return {
          partyId: party.id,
          partyName: party.partyName,
          partyCode: party.partyCode,
          siteId: site.id,
          siteCode: site.siteCode,
          siteName: site.siteName,
          mixType: site.mixType,
          orderedMT: site.orderedMT,
        };
      }));
    } catch (error) {
      console.error("[SitePulse integration] List sites failed:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to list sites" });
    }
  });

  app.patch("/api/dispatches/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const dispatchId = Array.isArray(id) ? id[0] : id;

      const editSchema = z.object({
        ownerPin: z.string().min(1, "Owner PIN required"),
        vehicleNo: z.string().min(1, "Vehicle number is required").transform(v => v.toUpperCase()),
        loadMT: z.string().min(1, "Load is required").refine(v => !isNaN(Number(v)) && Number(v) > 0, "Load must be a positive number"),
        notes: z.string().optional().default(""),
        driverName: z.string().optional().nullable(),
        driverMobile: z.string().optional().nullable(),
      });

      const parsed = editSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { ownerPin, vehicleNo, loadMT, notes, driverName, driverMobile } = parsed.data;

      const storedOwnerPin = await storage.getSetting("owner_pin");
      if (!storedOwnerPin) {
        return res.status(500).json({ error: "Owner PIN not configured. Please set it in Settings." });
      }

      if (ownerPin !== storedOwnerPin) {
        return res.status(401).json({ error: "Invalid Owner PIN" });
      }

      const dispatch = await storage.getDispatch(dispatchId);
      if (!dispatch) {
        return res.status(404).json({ error: "Dispatch not found" });
      }

      const updated = await storage.updateDispatch(dispatchId, {
        vehicleNo,
        loadMT: String(Number(loadMT)),
        notes: notes ? notes.toUpperCase() : null,
        driverName: driverName?.trim() || null,
        driverMobile: driverMobile?.trim() || null,
      });
      return res.json(updated);
    } catch (error) {
      console.error("Edit dispatch error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dispatches/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const dispatchId = Array.isArray(id) ? id[0] : id;
      const { ownerPin } = req.body;

      if (!ownerPin) {
        return res.status(400).json({ error: "Owner PIN required" });
      }

      const storedOwnerPin = await storage.getSetting("owner_pin");
      if (!storedOwnerPin) {
        return res.status(500).json({ error: "Owner PIN not configured. Please set it in Settings." });
      }

      if (ownerPin !== storedOwnerPin) {
        return res.status(401).json({ error: "Invalid Owner PIN" });
      }

      const dispatch = await storage.getDispatch(dispatchId);
      if (!dispatch) {
        return res.status(404).json({ error: "Dispatch not found" });
      }

      const deleted = await storage.deleteDispatch(dispatchId);
      if (!deleted) {
        return res.status(404).json({ error: "Dispatch not found" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Delete dispatch error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/dispatches/:id/arrived", requireRole("SITE"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { arrivedByName } = req.body;

      if (!arrivedByName) {
        return res.status(400).json({ error: "Receiver name is required" });
      }

      const dispatch = await storage.getDispatch(id);
      if (!dispatch) {
        return res.status(404).json({ error: "Dispatch not found" });
      }

      const partyId = (req.session as any).partyId;
      if (dispatch.partyId !== partyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (dispatch.status !== "DISPATCHED") {
        return res.status(400).json({ error: "Dispatch is not in DISPATCHED status" });
      }

      const statusAt = new Date();
      const updated = await storage.updateDispatch(id, {
        status: "ARRIVED",
        arrivedAt: statusAt,
        arrivedByName,
      });

      const party = await storage.getParty(dispatch.partyId);
      io.emit("dispatch-status-updated", {
        dispatch: updated,
        partyName: party?.partyName || "",
        partyCode: party?.partyCode || "",
        newStatus: "ARRIVED",
        receiverName: arrivedByName,
      });

      const arrSite = await storage.getSite(dispatch.siteId);
      sendSiteNotification(dispatch.siteId, {
        title: "📦 Dispatch Arrived",
        body: `${dispatch.challanNo} arrived at ${dispatch.siteName} - Received by ${arrivedByName}`,
        tag: `arrived-${dispatch.id}`,
        data: { type: "arrived", dispatchId: dispatch.id, url: arrSite ? `/site/${arrSite.accessId}` : "/" },
      }).catch((err) => console.error("Push notification error:", err));

      if (arrSite?.notifyMobile) {
        triggerSiteNotification({
          event: "ARRIVED",
          challanNo: dispatch.challanNo,
          siteName: dispatch.siteName,
          vehicleNo: dispatch.vehicleNo,
          driverName: dispatch.driverName,
          driverMobile: dispatch.driverMobile,
          loadMT: String(dispatch.loadMT),
          notifyMobile: arrSite.notifyMobile,
          timestamp: new Date(),
        }).catch((err) => console.error("[SMS] Arrived notification error:", err));
      }

      await enqueueStatusCallback(dispatch, "ARRIVED", statusAt, arrivedByName);
      return res.json(updated);
    } catch (error) {
      console.error("Arrived error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/dispatches/:id/left", requireRole("SITE"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { leftByName } = req.body;

      if (!leftByName) {
        return res.status(400).json({ error: "Receiver name is required" });
      }

      const dispatch = await storage.getDispatch(id);
      if (!dispatch) {
        return res.status(404).json({ error: "Dispatch not found" });
      }

      const partyId = (req.session as any).partyId;
      if (dispatch.partyId !== partyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (dispatch.status !== "ARRIVED") {
        return res.status(400).json({ error: "Dispatch is not in ARRIVED status" });
      }

      const statusAt = new Date();
      const updated = await storage.updateDispatch(id, {
        status: "UNLOADED",
        leftAt: statusAt,
        leftByName,
      });

      const party = await storage.getParty(dispatch.partyId);
      io.emit("dispatch-status-updated", {
        dispatch: updated,
        partyName: party?.partyName || "",
        partyCode: party?.partyCode || "",
        newStatus: "UNLOADED",
        receiverName: leftByName,
      });

      const leftSite = await storage.getSite(dispatch.siteId);
      sendSiteNotification(dispatch.siteId, {
        title: "✅ Dispatch Unloaded",
        body: `${dispatch.challanNo} unloaded at ${dispatch.siteName} - ${leftByName}`,
        tag: `left-${dispatch.id}`,
        data: { type: "left", dispatchId: dispatch.id, url: leftSite ? `/site/${leftSite.accessId}` : "/" },
      }).catch((err) => console.error("Push notification error:", err));

      if (leftSite?.notifyMobile) {
        triggerSiteNotification({
          event: "UNLOADED",
          challanNo: dispatch.challanNo,
          siteName: dispatch.siteName,
          vehicleNo: dispatch.vehicleNo,
          driverName: dispatch.driverName,
          driverMobile: dispatch.driverMobile,
          loadMT: String(dispatch.loadMT),
          notifyMobile: leftSite.notifyMobile,
          timestamp: new Date(),
        }).catch((err) => console.error("[SMS] Unloaded notification error:", err));
      }

      await enqueueStatusCallback(dispatch, "LEFT", statusAt, leftByName);
      return res.json(updated);
    } catch (error) {
      console.error("Left error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/site/validate/:token", async (req: Request, res: Response) => {
    try {
      const { token: siteToken } = req.params;

      const site = await storage.getSiteByAccessId(siteToken);
      if (site) {
        const party = await storage.getParty(site.partyId);
        if (!party || party.status !== "ACTIVE") {
          return res.status(401).json({ valid: false, error: "Access closed - party/order is not active" });
        }
        if (site.status !== "ACTIVE") {
          return res.status(401).json({ valid: false, error: "This site link is no longer valid. Please contact the plant for a new link." });
        }
        const dispatches = await storage.getDispatchesBySite(site.id);
        const orderedMT = Number(site.orderedMT || 0);
        const dispatchedMT = dispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
        const balanceMT = orderedMT - dispatchedMT;
        return res.json({
          valid: true,
          partyName: party.partyName,
          partyCode: party.partyCode,
          partyId: party.id,
          siteId: site.id,
          siteName: site.siteName,
          orderedMT: orderedMT.toFixed(2),
          dispatchedMT: dispatchedMT.toFixed(2),
          balanceMT: balanceMT.toFixed(2),
        });
      }

      const token = await storage.getSiteTokenByToken(siteToken);
      if (token && token.active) {
        const party = await storage.getParty(token.partyId);
        if (!party || party.status !== "ACTIVE") {
          return res.status(401).json({ valid: false, error: "Access closed - party/order is not active" });
        }
        const sites = await storage.getSitesByParty(party.id);
        const orderedMT = sites.reduce((sum, s) => sum + Number(s.orderedMT || 0), 0);
        const dispatches = await storage.getDispatchesByParty(party.id);
        const dispatchedMT = dispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
        const balanceMT = orderedMT - dispatchedMT;
        return res.json({
          valid: true,
          partyName: party.partyName,
          partyCode: party.partyCode,
          partyId: party.id,
          orderedMT: orderedMT.toFixed(2),
          dispatchedMT: dispatchedMT.toFixed(2),
          balanceMT: balanceMT.toFixed(2),
        });
      }

      const partyByAccess = await storage.getPartyByAccessId(siteToken);
      if (partyByAccess && partyByAccess.status === "ACTIVE") {
        const sites = await storage.getSitesByParty(partyByAccess.id);
        const orderedMT = sites.reduce((sum, s) => sum + Number(s.orderedMT || 0), 0);
        const dispatches = await storage.getDispatchesByParty(partyByAccess.id);
        const dispatchedMT = dispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
        const balanceMT = orderedMT - dispatchedMT;
        return res.json({
          valid: true,
          partyName: partyByAccess.partyName,
          partyCode: partyByAccess.partyCode,
          partyId: partyByAccess.id,
          orderedMT: orderedMT.toFixed(2),
          dispatchedMT: dispatchedMT.toFixed(2),
          balanceMT: balanceMT.toFixed(2),
        });
      }

      return res.status(401).json({ valid: false, error: "Invalid or inactive token" });
    } catch (error) {
      console.error("Validate token error:", error);
      return res.status(500).json({ valid: false, error: "Internal server error" });
    }
  });

  async function resolveAccessFromToken(siteToken: string): Promise<{ party: any; site?: any; error?: string } | null> {
    const site = await storage.getSiteByAccessId(siteToken);
    if (site) {
      const party = await storage.getParty(site.partyId);
      if (!party || party.status !== "ACTIVE") {
        return { party: null, error: "Access closed - party/order is not active" };
      }
      return { party, site };
    }

    const token = await storage.getSiteTokenByToken(siteToken);
    if (token && token.active) {
      const party = await storage.getParty(token.partyId);
      if (!party || party.status !== "ACTIVE") {
        return { party: null, error: "Access closed - party/order is not active" };
      }
      return { party };
    }

    const partyByAccess = await storage.getPartyByAccessId(siteToken);
    if (partyByAccess && partyByAccess.status === "ACTIVE") {
      return { party: partyByAccess };
    }

    return null;
  }

  app.get("/api/site/dispatches/:token", async (req: Request, res: Response) => {
    try {
      const { token: siteToken } = req.params;

      const result = await resolveAccessFromToken(siteToken);
      if (!result) {
        return res.status(401).json({ error: "Invalid or inactive token" });
      }
      if (result.error) {
        return res.status(401).json({ error: result.error });
      }

      const dispatches = result.site 
        ? await storage.getDispatchesBySite(result.site.id)
        : await storage.getDispatchesByParty(result.party.id);
      return res.json(dispatches);
    } catch (error) {
      console.error("Get site dispatches error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/site/dispatches/:id/arrived", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { arrivedByName, token: siteToken } = req.body;

      if (!arrivedByName) {
        return res.status(400).json({ error: "Receiver name is required" });
      }

      if (!siteToken) {
        return res.status(400).json({ error: "Token is required" });
      }

      const result = await resolveAccessFromToken(siteToken);
      if (!result) {
        return res.status(401).json({ error: "Invalid or inactive token" });
      }
      if (result.error) {
        return res.status(401).json({ error: result.error });
      }

      const dispatch = await storage.getDispatch(id);
      if (!dispatch) {
        return res.status(404).json({ error: "Dispatch not found" });
      }

      if (dispatch.partyId !== result.party.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (result.site && dispatch.siteId !== result.site.id) {
        return res.status(403).json({ error: "Forbidden - dispatch not for this site" });
      }

      if (dispatch.status !== "DISPATCHED") {
        return res.status(400).json({ error: "Dispatch is not in DISPATCHED status" });
      }

      const statusAt = new Date();
      const updated = await storage.updateDispatch(id, {
        status: "ARRIVED",
        arrivedAt: statusAt,
        arrivedByName,
      });

      io.emit("dispatch-status-updated", {
        dispatch: updated,
        partyName: result.party.partyName,
        partyCode: result.party.partyCode,
        newStatus: "ARRIVED",
        receiverName: arrivedByName,
      });

      const arrSite = await storage.getSite(dispatch.siteId);
      sendSiteNotification(dispatch.siteId, {
        title: "📦 Dispatch Arrived",
        body: `${dispatch.challanNo} arrived at ${dispatch.siteName} - Received by ${arrivedByName}`,
        tag: `arrived-${dispatch.id}`,
        data: { type: "arrived", dispatchId: dispatch.id, url: arrSite ? `/site/${arrSite.accessId}` : "/" },
      }).catch((err) => console.error("Push notification error:", err));

      if (arrSite?.notifyMobile) {
        triggerSiteNotification({
          event: "ARRIVED",
          challanNo: dispatch.challanNo,
          siteName: dispatch.siteName,
          vehicleNo: dispatch.vehicleNo,
          driverName: dispatch.driverName,
          driverMobile: dispatch.driverMobile,
          loadMT: String(dispatch.loadMT),
          notifyMobile: arrSite.notifyMobile,
          timestamp: new Date(),
        }).catch((err) => console.error("[SMS] Site arrived notification error:", err));
      }

      await enqueueStatusCallback(dispatch, "ARRIVED", statusAt, arrivedByName);
      return res.json(updated);
    } catch (error) {
      console.error("Site arrived error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/site/dispatches/:id/left", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { leftByName, token: siteToken } = req.body;

      if (!leftByName) {
        return res.status(400).json({ error: "Receiver name is required" });
      }

      if (!siteToken) {
        return res.status(400).json({ error: "Token is required" });
      }

      const result = await resolveAccessFromToken(siteToken);
      if (!result) {
        return res.status(401).json({ error: "Invalid or inactive token" });
      }
      if (result.error) {
        return res.status(401).json({ error: result.error });
      }

      const dispatch = await storage.getDispatch(id);
      if (!dispatch) {
        return res.status(404).json({ error: "Dispatch not found" });
      }

      if (dispatch.partyId !== result.party.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (result.site && dispatch.siteId !== result.site.id) {
        return res.status(403).json({ error: "Forbidden - dispatch not for this site" });
      }

      if (dispatch.status !== "ARRIVED") {
        return res.status(400).json({ error: "Dispatch is not in ARRIVED status" });
      }

      const statusAt = new Date();
      const updated = await storage.updateDispatch(id, {
        status: "UNLOADED",
        leftAt: statusAt,
        leftByName,
      });

      io.emit("dispatch-status-updated", {
        dispatch: updated,
        partyName: result.party.partyName,
        partyCode: result.party.partyCode,
        newStatus: "UNLOADED",
        receiverName: leftByName,
      });

      const leftSite = await storage.getSite(dispatch.siteId);
      sendSiteNotification(dispatch.siteId, {
        title: "✅ Dispatch Unloaded",
        body: `${dispatch.challanNo} unloaded at ${dispatch.siteName} - ${leftByName}`,
        tag: `left-${dispatch.id}`,
        data: { type: "left", dispatchId: dispatch.id, url: leftSite ? `/site/${leftSite.accessId}` : "/" },
      }).catch((err) => console.error("Push notification error:", err));

      if (leftSite?.notifyMobile) {
        triggerSiteNotification({
          event: "UNLOADED",
          challanNo: dispatch.challanNo,
          siteName: dispatch.siteName,
          vehicleNo: dispatch.vehicleNo,
          driverName: dispatch.driverName,
          driverMobile: dispatch.driverMobile,
          loadMT: String(dispatch.loadMT),
          notifyMobile: leftSite.notifyMobile,
          timestamp: new Date(),
        }).catch((err) => console.error("[SMS] Site left notification error:", err));
      }

      await enqueueStatusCallback(dispatch, "LEFT", statusAt, leftByName);
      return res.json(updated);
    } catch (error) {
      console.error("Site left error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/parties/:id/tokens", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tokens = await storage.getSiteTokensByParty(id);
      return res.json(tokens);
    } catch (error) {
      console.error("Get tokens error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/push/vapid-public-key", (_req: Request, res: Response) => {
    res.json({ key: getVapidPublicKey() });
  });

  const pushSubscribeSchema = z.object({
    endpoint: z.string().url(),
    p256dh: z.string().min(1),
    auth: z.string().min(1),
    role: z.string().nullable().optional(),
    siteId: z.string().nullable().optional(),
  });

  app.post("/api/push/subscribe", async (req: Request, res: Response) => {
    try {
      const parsed = pushSubscribeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }
      const { endpoint, p256dh, auth, role, siteId } = parsed.data;
      await storage.savePushSubscription({ endpoint, p256dh, auth, role: role || null, siteId: siteId || null });
      return res.json({ success: true });
    } catch (error) {
      console.error("Push subscribe error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/push/unsubscribe", async (req: Request, res: Response) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint || typeof endpoint !== "string") {
        return res.status(400).json({ error: "Endpoint required" });
      }
      await storage.removePushSubscription(endpoint);
      return res.json({ success: true });
    } catch (error) {
      console.error("Push unsubscribe error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/push/test", requireAdmin, async (_req: Request, res: Response) => {
    try {
      await broadcastNotification({
        title: "🔔 Test Notification",
        body: "Push notifications are working! You will receive alerts for dispatch events.",
        tag: "test-notification",
        data: { type: "test" },
      });
      const subscriptions = await storage.getAllPushSubscriptions();
      return res.json({ success: true, subscriberCount: subscriptions.length });
    } catch (error) {
      console.error("Test push error:", error);
      return res.status(500).json({ error: "Failed to send test notification" });
    }
  });

  return httpServer;
}
