import express from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import multer, { StorageEngine } from 'multer';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

// File uploads
const storage: StorageEngine = multer.diskStorage({
  destination: function (_req: express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: function (_req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// Get all chats
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    const chats = await prisma.chat.findMany({
      where: whereClause,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        admin: {
          select: { username: true }
        }
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    });

    const total = await prisma.chat.count({ where: whereClause });

    res.json({
      chats,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific chat with messages
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const chat = await prisma.chat.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        admin: {
          select: { username: true }
        }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json(chat);
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new chat
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { sessionId, customerId, customerName, customerEmail } = req.body;

    if (!sessionId || !customerId) {
      return res.status(400).json({ error: 'Session ID and customer ID are required' });
    }

    // Check if chat already exists
    const existingChat = await prisma.chat.findUnique({
      where: { sessionId }
    });

    if (existingChat) {
      return res.json(existingChat);
    }

    const chat = await prisma.chat.create({
      data: {
        sessionId,
        customerId,
        customerName,
        customerEmail
      }
    });

    res.status(201).json(chat);
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update chat status
router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'CLOSED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const chat = await prisma.chat.update({
      where: { id },
      data: { status }
    });

    res.json(chat);
  } catch (error) {
    console.error('Update chat status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign chat to admin
router.patch('/:id/assign', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    const chat = await prisma.chat.update({
      where: { id },
      data: { adminId }
    });

    res.json(chat);
  } catch (error) {
    console.error('Assign chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload attachment to a chat (image/doc)
router.post('/:id/attachments', upload.single('file'), async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    const message = await prisma.message.create({
      data: {
        chatId: id,
        content: 'Attachment',
        sender: req.user?.role === 'admin' ? 'ADMIN' : 'CUSTOMER',
        senderId: req.user?.id,
        metadata: { attachment: { url: fileUrl, name: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size } }
      }
    });

    await prisma.chat.update({ where: { id }, data: { lastMessageAt: new Date() } });

    res.status(201).json({ message, fileUrl });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
