import { PrismaClient } from './node_modules/@prisma/client/index.js';
const p = new PrismaClient();
try {
  const users = await p.user.findMany({
    select: { id: true, email: true, name: true, role: true, currentStatus: true, isOnboarding: true }
  });
  console.log(JSON.stringify(users, null, 2));
} catch(e) {
  console.error(e.message);
} finally {
  await p.$disconnect();
}
