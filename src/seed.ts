import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables

dotenv.config({ path: "./.env.example" });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword
    }
  });

  console.log('✅ Admin user created:', { username: admin.username });

  // Create sample chat for testing
  const sampleChat = await prisma.chat.create({
    data: {
      sessionId: 'sample-session-123',
      customerId: 'customer-123',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      status: 'ACTIVE'
    }
  });

  // Create sample messages
  await prisma.message.createMany({
    data: [
      {
        chatId: sampleChat.id,
        content: 'Hello! I need help with my order.',
        sender: 'CUSTOMER',
        senderId: 'customer-123'
      },
      {
        chatId: sampleChat.id,
        content: 'Hi! I\'d be happy to help you with your order. Can you provide your order number?',
        sender: 'ADMIN',
        senderId: admin.id
      }
    ]
  });

  console.log('✅ Sample chat and messages created');
  console.log('🎉 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
