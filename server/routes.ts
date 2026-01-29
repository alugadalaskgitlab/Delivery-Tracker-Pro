import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { hashPassword, verifyPassword, requireAuth, requireAdmin, requirePlantOrAdmin, requireRole, getCurrentUser } from "./auth";
import { insertPartySchema, insertDispatchSchema } from "@shared/schema";
import { z } from "zod";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function formatChallan(partyCode: string, seq: number) {
  return `${partyCode}-${String(seq).padStart(4, "0")}`;
}

function randomToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  app.post("/api/auth/pin-login", async (req: Request, res: Response) => {
    try {
      const { role, pin } = req.body;

      if (!role || !pin) {
        return res.status(400).json({ error: "Role and PIN required" });
      }

      if (role !== "ADMIN" && role !== "PLANT") {
        return res.status(400).json({ error: "Invalid role" });
      }

      const settingKey = role === "ADMIN" ? "admin_pin" : "plant_pin";
      const storedPin = await storage.getSetting(settingKey);

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
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ error: "Value required" });
      }

      await storage.setSetting(key, value);
      return res.json({ key, value });
    } catch (error) {
      console.error("Set setting error:", error);
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
      const data = insertPartySchema.parse(req.body);
      const accessId = slugify(data.partyCode || data.partyName);
      
      const existingCode = await storage.getPartyByCode(data.partyCode);
      if (existingCode) {
        return res.status(400).json({ error: "Party code already exists" });
      }

      const party = await storage.createParty({
        ...data,
        accessId,
        createdBy: req.session.userId,
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
      const party = await storage.updateParty(id, req.body);
      
      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }

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

      const dispatchCount = await storage.getDispatchCountByParty(partyId);
      if (dispatchCount > 0) {
        return res.status(400).json({ error: "Cannot delete party with existing dispatches" });
      }

      await storage.deactivateSiteTokensByParty(partyId);
      await storage.deletePartySequence(partyId);
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

  app.get("/api/dispatches", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.session.role === "SITE") {
        const partyId = (req.session as any).partyId;
        const dispatches = await storage.getDispatchesByParty(partyId);
        return res.json(dispatches);
      }

      if (req.session.role === "PLANT") {
        const dispatches = await storage.getDispatchesByCreator(req.session.userId!);
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
      const data = insertDispatchSchema.omit({ challanNo: true }).parse(req.body);
      
      const party = await storage.getParty(data.partyId);
      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }

      if (party.status !== "ACTIVE") {
        return res.status(400).json({ error: "Party is not active" });
      }

      const nextSeq = await storage.incrementPartySequence(data.partyId);
      const challanNo = formatChallan(party.partyCode, nextSeq);

      const dispatch = await storage.createDispatch({
        ...data,
        challanNo,
        partyName: party.partyName,
        partyCode: party.partyCode,
        orderRefNo: party.orderRefNo,
        createdBy: req.session.userId,
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

      const updated = await storage.updateDispatch(id, {
        status: "ARRIVED",
        arrivedAt: new Date(),
        arrivedByName,
      });

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

      const updated = await storage.updateDispatch(id, {
        status: "LEFT",
        leftAt: new Date(),
        leftByName,
      });

      return res.json(updated);
    } catch (error) {
      console.error("Left error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/site/validate/:token", async (req: Request, res: Response) => {
    try {
      const { token: siteToken } = req.params;

      const token = await storage.getSiteTokenByToken(siteToken);
      if (token && token.active) {
        const party = await storage.getParty(token.partyId);
        if (!party || party.status !== "ACTIVE") {
          return res.status(401).json({ valid: false, error: "Access closed - party/order is not active" });
        }
        return res.json({
          valid: true,
          partyName: party.partyName,
          partyCode: party.partyCode,
          partyId: party.id,
        });
      }

      const partyByAccess = await storage.getPartyByAccessId(siteToken);
      if (partyByAccess && partyByAccess.status === "ACTIVE") {
        return res.json({
          valid: true,
          partyName: partyByAccess.partyName,
          partyCode: partyByAccess.partyCode,
          partyId: partyByAccess.id,
        });
      }

      return res.status(401).json({ valid: false, error: "Invalid or inactive token" });
    } catch (error) {
      console.error("Validate token error:", error);
      return res.status(500).json({ valid: false, error: "Internal server error" });
    }
  });

  async function resolvePartyFromToken(siteToken: string): Promise<{ party: any; error?: string } | null> {
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

      const result = await resolvePartyFromToken(siteToken);
      if (!result) {
        return res.status(401).json({ error: "Invalid or inactive token" });
      }
      if (result.error) {
        return res.status(401).json({ error: result.error });
      }

      const dispatches = await storage.getDispatchesByParty(result.party.id);
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

      const result = await resolvePartyFromToken(siteToken);
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

      if (dispatch.status !== "DISPATCHED") {
        return res.status(400).json({ error: "Dispatch is not in DISPATCHED status" });
      }

      const updated = await storage.updateDispatch(id, {
        status: "ARRIVED",
        arrivedAt: new Date(),
        arrivedByName,
      });

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

      const result = await resolvePartyFromToken(siteToken);
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

      if (dispatch.status !== "ARRIVED") {
        return res.status(400).json({ error: "Dispatch is not in ARRIVED status" });
      }

      const updated = await storage.updateDispatch(id, {
        status: "LEFT",
        leftAt: new Date(),
        leftByName,
      });

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

  return httpServer;
}
