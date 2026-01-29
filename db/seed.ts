import { db } from "./index";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const existingAdminPin = await db.select().from(appSettings).where(eq(appSettings.key, "admin_pin")).limit(1);
  
  if (existingAdminPin.length === 0) {
    await db.insert(appSettings).values({
      key: "admin_pin",
      value: "1234",
    });
    console.log("✓ Created admin PIN (default: 1234)");
  } else {
    console.log("✓ Admin PIN already exists");
  }

  const existingPlantPin = await db.select().from(appSettings).where(eq(appSettings.key, "plant_pin")).limit(1);
  
  if (existingPlantPin.length === 0) {
    await db.insert(appSettings).values({
      key: "plant_pin",
      value: "5678",
    });
    console.log("✓ Created plant PIN (default: 5678)");
  } else {
    console.log("✓ Plant PIN already exists");
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
