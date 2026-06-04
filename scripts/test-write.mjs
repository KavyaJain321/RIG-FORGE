import { PrismaClient } from '../node_modules/@prisma/client/index.js'

const p = new PrismaClient({ log: ['error', 'warn'] })
const t0 = Date.now()
const dur = () => `${((Date.now() - t0) / 1000).toFixed(2)}s`

try {
  console.log(`[${dur()}] connecting...`)
  const me = await p.user.findUnique({ where: { email: 'kavya@rigforge.com' } })
  console.log(`[${dur()}] read OK · id=${me?.id} · isOnboarding=${me?.isOnboarding}`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  console.log(`[${dur()}] writing currentStatus=WORKING...`)
  await p.user.update({ where: { id: me.id }, data: { currentStatus: 'WORKING' } })
  console.log(`[${dur()}] update OK`)

  console.log(`[${dur()}] upserting dailyActivity...`)
  await p.dailyActivity.upsert({
    where: { userId_date: { userId: me.id, date: today } },
    update: { wasActive: true, lastSeenAt: new Date() },
    create: { userId: me.id, date: today, wasActive: true, lastSeenAt: new Date() },
  })
  console.log(`[${dur()}] upsert OK`)
  console.log(`[${dur()}] all writes succeeded`)
} catch (e) {
  console.error(`[${dur()}] FAIL:`, e.code || '', e.message)
  if (e.meta) console.error('meta:', e.meta)
}
await p.$disconnect()
