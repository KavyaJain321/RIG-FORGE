import { PrismaClient } from './node_modules/@prisma/client/index.js';
import bcrypt from './node_modules/bcryptjs/index.js';
const p = new PrismaClient();
const hash = await bcrypt.hash('Admin123!', 10);
await p.user.update({ where: { email: 'admin@forge.com' }, data: { passwordHash: hash } });
console.log('Password reset to Admin123!');
await p.$disconnect();
