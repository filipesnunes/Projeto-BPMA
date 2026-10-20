import { PrismaClient } from "@prisma/client";
import { activeOperationalRecords } from "@/lib/active-operational-records";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  operationalFilterClients?: WeakSet<PrismaClient>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"]
  });

const filteredClients = globalForPrisma.operationalFilterClients ??= new WeakSet<PrismaClient>();
if (!filteredClients.has(prisma)) {
  prisma.$use(activeOperationalRecords);
  filteredClients.add(prisma);
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
