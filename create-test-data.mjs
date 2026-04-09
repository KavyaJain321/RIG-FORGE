import { PrismaClient } from './node_modules/@prisma/client/index.js';
const p = new PrismaClient();

try {
  const admin = await p.user.findUnique({ where: { email: 'admin@forge.com' } });
  const emp = await p.user.findUnique({ where: { email: 'employee@forge.com' } });

  // Create a second project that employee is NOT part of
  const proj2 = await p.project.upsert({
    where: { id: 'test-proj-2-secret' },
    update: {},
    create: {
      id: 'test-proj-2-secret',
      name: 'ADMIN ONLY PROJECT',
      description: 'This project employee should NOT see',
      status: 'ACTIVE',
      priority: 'HIGH',
      leadId: admin.id,
      members: {
        create: { userId: admin.id }
      }
    }
  });
  console.log('Created project 2 (admin only):', proj2.name, proj2.id);

  // Add a task to OSINT project
  const osint = await p.project.findFirst({ where: { name: 'OSINT' } });
  if (osint) {
    const existingTask = await p.task.findFirst({ where: { projectId: osint.id } });
    if (!existingTask) {
      const task = await p.task.create({
        data: {
          title: 'Gather intelligence report',
          description: 'Compile weekly OSINT findings',
          expectedOutput: 'PDF report of findings',
          status: 'TODO',
          priority: 'MEDIUM',
          dueDate: new Date('2026-04-30'),
          projectId: osint.id,
          assigneeId: emp.id
        }
      });
      console.log('Created task:', task.title);
    } else {
      console.log('Task already exists:', existingTask.title);
    }
  }

  console.log('\n=== TEST SETUP ===');
  console.log('OSINT project      → Employee IS a member');
  console.log('ADMIN ONLY PROJECT → Employee is NOT a member');
  console.log('Task added to OSINT for employee');

} catch(e) {
  console.error('ERROR:', e.message);
} finally {
  await p.$disconnect();
}
