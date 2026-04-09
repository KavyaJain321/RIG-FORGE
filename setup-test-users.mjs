import { PrismaClient } from './node_modules/@prisma/client/index.js';
import bcrypt from './node_modules/bcryptjs/index.js';

const p = new PrismaClient();

try {
  const adminHash = await bcrypt.hash('Admin1234!', 10);
  const empHash = await bcrypt.hash('Emp12345!', 10);

  // Reset admin password
  const admin = await p.user.update({
    where: { email: 'admin@forge.com' },
    data: { passwordHash: adminHash, isOnboarding: false, currentStatus: 'NOT_WORKING' },
  });
  console.log('Admin updated:', admin.email, admin.role);

  // Create/update test employee
  const empEmail = 'employee@forge.com';
  const existing = await p.user.findUnique({ where: { email: empEmail } });
  let emp;
  if (existing) {
    emp = await p.user.update({
      where: { email: empEmail },
      data: { passwordHash: empHash, isOnboarding: false, currentStatus: 'NOT_WORKING' },
    });
    console.log('Employee updated:', emp.email, emp.role);
  } else {
    emp = await p.user.create({
      data: {
        name: 'Test Employee',
        email: empEmail,
        passwordHash: empHash,
        role: 'EMPLOYEE',
        isOnboarding: false,
        currentStatus: 'NOT_WORKING',
      },
    });
    console.log('Employee created:', emp.email, emp.role);
  }

  console.log('\n=== TEST CREDENTIALS ===');
  console.log('ADMIN:    admin@forge.com    / Admin1234!');
  console.log('EMPLOYEE: employee@forge.com / Emp12345!');
  console.log('Admin ID:', admin.id);
  console.log('Emp ID:  ', emp.id);

} catch(e) {
  console.error('ERROR:', e.message);
} finally {
  await p.$disconnect();
}
