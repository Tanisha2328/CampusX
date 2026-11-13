import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { registerSchema } from '../src/auth/validation.js'

const passwordCost = 12

async function main() {
  const parsed = registerSchema.safeParse({
    name: process.env.FACULTY_NAME || 'CampusX Test Faculty',
    email: process.env.FACULTY_EMAIL,
    password: process.env.FACULTY_PASSWORD,
  })

  if (!parsed.success) {
    console.error('Set FACULTY_EMAIL and a valid FACULTY_PASSWORD (12-72 characters); check FACULTY_NAME if provided.')
    process.exitCode = 1
    return
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL must be configured in the server environment.')
    process.exitCode = 1
    return
  }

  const { name, email, password } = parsed.data
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existing) {
      console.error('An account with that normalized email already exists. No changes were made.')
      process.exitCode = 1
      return
    }

    const passwordHash = await bcrypt.hash(password, passwordCost)
    await prisma.user.create({
      data: { name, email, passwordHash, role: 'FACULTY' },
      select: { id: true },
    })
    console.log(`Created FACULTY test account: ${email}`)
  } catch (error) {
    if (error?.code === 'P2002') {
      console.error('An account with that normalized email already exists. No changes were made.')
    } else {
      console.error('Could not create the FACULTY test account. No credentials were printed.')
    }
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(async () => {
  console.error('Could not create the FACULTY test account. No credentials were printed.')
  process.exitCode = 1
})
