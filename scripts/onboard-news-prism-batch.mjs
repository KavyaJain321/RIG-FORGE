import { PrismaClient } from '../node_modules/@prisma/client/index.js'
import bcrypt from '../node_modules/bcryptjs/index.js'
import crypto from 'node:crypto'

const NEWS_PRISM_PROJECT_ID = 'cmnn11vd3001c10y012csvd9v'

const newcomers = [
  { name: 'Pragati Chamoli',  email: 'pragati@rigforge.com'  },
  { name: 'Shakshi Verma',    email: 'shakshi@rigforge.com'  },
  { name: 'Minakshi Uniyal',  email: 'minakshi@rigforge.com' },
  { name: 'Tanisha Sharma',   email: 'tanisha@rigforge.com'  },
  { name: 'Armaan Juneja',    email: 'armaan@rigforge.com'   },
  { name: 'Aashray Iyengar',  email: 'aashray@rigforge.com'  },
  { name: 'Anamika Ghuman',   email: 'anamika@rigforge.com'  },
  { name: 'Karnika Karanwal', email: 'karnika@rigforge.com'  },
  { name: 'Aditi Bhidola',    email: 'aditi@rigforge.com'    },
  { name: 'Rittana Mittal',   email: 'rittana@rigforge.com'  },
]

function generateTempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%&'
  const alphabet = letters + digits
  const bytes = crypto.randomBytes(64)
  let out = ''
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length]
  const pos1 = bytes[10] % 10
  const pos2 = bytes[11] % 10
  out = out.slice(0, pos1) + symbols[bytes[12] % symbols.length] + out.slice(pos1)
  out = out.slice(0, pos2) + symbols[bytes[13] % symbols.length] + out.slice(pos2)
  return out
}

const prisma = new PrismaClient()

const project = await prisma.project.findUnique({
  where: { id: NEWS_PRISM_PROJECT_ID },
  select: { id: true, name: true },
})
if (!project) {
  console.error('News Prism project not found, aborting')
  await prisma.$disconnect()
  process.exit(1)
}
console.log(`target project: ${project.name} (${project.id})`)

const results = []
for (const { name, email } of newcomers) {
  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 12)

  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      tempPassword,
      mustChangePassword: true,
      isOnboarding: false,
      isActive: true,
      role: 'EMPLOYEE',
    },
    select: { id: true, name: true, email: true },
  })

  await prisma.projectMember.create({
    data: {
      userId: created.id,
      projectId: NEWS_PRISM_PROJECT_ID,
      contribution: 0,
    },
  })

  results.push({ ...created, tempPassword })
  console.log(`created: ${created.name.padEnd(18)} ${email.padEnd(28)} -> News Prism member`)
}

console.log('\n--- credentials (copy from here) ---')
console.log(JSON.stringify(results, null, 2))

await prisma.$disconnect()
