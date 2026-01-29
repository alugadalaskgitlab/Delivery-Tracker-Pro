import { db } from "./index";
import { users } from "@shared/schema";
import { hashPassword } from "../server/auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const adminUsername = "admin";
  const existingAdmin = await db.select().from(users).where(eq(users.username, adminUsername)).limit(1);
  
  if (existingAdmin.length === 0) {
    await db.insert(users).values({
      username: adminUsername,
      password: await hashPassword("admin123"),
      role: "ADMIN",
      displayName: "Administrator",
    });
    console.log("✓ Created admin user (username: admin, password: admin123)");
  } else {
    console.log("✓ Admin user already exists");
  }

  const plantUsername = "plant";
  const existingPlant = await db.select().from(users).where(eq(users.username, plantUsername)).limit(1);
  
  if (existingPlant.length === 0) {
    await db.insert(users).values({
      username: plantUsername,
      password: await hashPassword("plant123"),
      role: "PLANT",
      displayName: "Plant Operator",
    });
    console.log("✓ Created plant user (username: plant, password: plant123)");
  } else {
    console.log("✓ Plant user already exists");
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
