import { PrismaClient } from '../node_modules/@prisma/client/index.js'
const p = new PrismaClient()

const projects = await p.project.findMany({
  include: {
    lead: { select: { name: true, email: true, role: true } },
    members: {
      include: { user: { select: { name: true, email: true, role: true } } },
    },
  },
  orderBy: { name: 'asc' },
})

console.log(JSON.stringify(projects.map(pr => ({
  id: pr.id,
  name: pr.name,
  status: pr.status,
  priority: pr.priority,
  description: pr.description,
  lead: pr.lead?.name ?? null,
  members: pr.members.map(m => ({ name: m.user.name, role: m.user.role, email: m.user.email })),
})), null, 2))

await p.$disconnect()
