import { db } from "../lib/db";
import { seedDemoBooth } from "../lib/demo-booth-seed";

seedDemoBooth()
  .then((result) => {
    console.log(
      `Seeded ${result.path} with ${result.productCount} products and ${result.gachaRevealCount} free reveals.`,
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
