"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketHandler = void 0;
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Use global fetch available in Node 18+
const prisma = new client_1.PrismaClient();
const socketHandler = (io, prisma) => {
    // Authentication middleware for socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                // Allow customer connections without token
                socket.user = {
                    id: socket.handshake.auth.sessionId || socket.id,
                    username: 'Customer',
                    type: 'customer'
                };
                return next();
            }
            // Verify token
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            if (decoded.role === 'admin') {
                const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });
                if (!admin)
                    return next(new Error('Authentication failed'));
                socket.user = { id: admin.id, username: admin.username, type: 'admin' };
            }
            else if (decoded.role === 'customer') {
                const customer = await prisma.customer.findUnique({ where: { id: decoded.id } });
                if (!customer)
                    return next(new Error('Authentication failed'));
                socket.user = { id: customer.id, username: customer.name, type: 'customer' };
            }
            else {
                return next(new Error('Authentication failed'));
            }
            next();
        }
        catch (error) {
            // Allow customer connections even if token verification fails
            socket.user = {
                id: socket.handshake.auth.sessionId || socket.id,
                username: 'Customer',
                type: 'customer'
            };
            next();
        }
    });
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user?.username} (${socket.user?.type})`);
        // Join chat room
        socket.on('join_room', async (data) => {
            try {
                const { chatId } = data;
                // Verify chat exists
                const chat = await prisma.chat.findUnique({
                    where: { id: chatId }
                });
                if (!chat) {
                    socket.emit('error', { message: 'Chat not found' });
                    return;
                }
                socket.join(chatId);
                socket.emit('joined_room', { chatId });
                // Mark messages as read if admin joins
                if (socket.user?.type === 'admin') {
                    await prisma.message.updateMany({
                        where: {
                            chatId,
                            sender: 'CUSTOMER',
                            isRead: false
                        },
                        data: { isRead: true }
                    });
                }
            }
            catch (error) {
                console.error('Join room error:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });
        // Send message
        socket.on('send_message', async (data) => {
            try {
                const { chatId, content, senderId } = data;
                if (!content.trim()) {
                    socket.emit('error', { message: 'Message content is required' });
                    return;
                }
                // Create message in database
                const message = await prisma.message.create({
                    data: {
                        chatId,
                        content: content.trim(),
                        sender: socket.user?.type === 'admin' ? 'ADMIN' : 'CUSTOMER',
                        senderId: senderId || socket.user?.id,
                        metadata: {
                            userAgent: socket.handshake.headers['user-agent'],
                            ip: socket.handshake.address
                        }
                    },
                    include: {
                        chat: true
                    }
                });
                // Update chat's last message time
                await prisma.chat.update({
                    where: { id: chatId },
                    data: { lastMessageAt: new Date() }
                });
                // Emit message to all clients in the room
                io.to(chatId).emit('receive_message', {
                    id: message.id,
                    content: message.content,
                    sender: message.sender,
                    senderId: message.senderId,
                    createdAt: message.createdAt,
                    chatId: message.chatId,
                    metadata: message.metadata
                });
                // Notify admin if customer sent message
                if (socket.user?.type === 'customer') {
                    io.emit('new_customer_message', {
                        chatId,
                        customerId: socket.user.id,
                        message: content
                    });
                    // Trigger AI assistant typing and response if OpenAI key is set
                    if (process.env.OPENAI_API_KEY) {
                        // Broadcast typing indicator as Support
                        io.to(chatId).emit('user_typing', { userId: 'ai', username: 'Support' });
                        try {
                            // Build simple context from latest 10 messages
                            const recent = await prisma.message.findMany({
                                where: { chatId },
                                orderBy: { createdAt: 'desc' },
                                take: 10
                            });
                            const history = recent
                                .reverse()
                                .map(m => ({
                                role: m.sender === 'CUSTOMER' ? 'user' : 'assistant',
                                content: m.content
                            }));
                            const completion = await fetch('https://api.openai.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                                },
                                body: JSON.stringify({
                                    model: 'gpt-3.5-turbo',
                                    messages: [
                                        { role: 'system', content: 'You are a helpful support agent. Be concise and friendly.' },
                                        ...history
                                    ],
                                    temperature: 0.7,
                                    max_tokens: 200
                                })
                            });
                            const result = await completion.json();
                            const aiText = result?.choices?.[0]?.message?.content?.trim?.() || '';
                            if (aiText) {
                                const aiMsg = await prisma.message.create({
                                    data: {
                                        chatId,
                                        content: aiText,
                                        sender: 'ADMIN',
                                        senderId: 'ai',
                                        metadata: { aiGenerated: true }
                                    }
                                });
                                await prisma.chat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } });
                                io.to(chatId).emit('receive_message', {
                                    id: aiMsg.id,
                                    content: aiMsg.content,
                                    sender: aiMsg.sender,
                                    senderId: aiMsg.senderId,
                                    createdAt: aiMsg.createdAt,
                                    chatId: aiMsg.chatId,
                                    metadata: { aiGenerated: true }
                                });
                            }
                        }
                        catch (e) {
                            console.error('AI response error:', e);
                        }
                        finally {
                            io.to(chatId).emit('user_stopped_typing', { userId: 'ai', username: 'Support' });
                        }
                    }
                }
            }
            catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        // Typing indicators
        socket.on('user_typing', (data) => {
            socket.to(data.chatId).emit('user_typing', {
                userId: socket.user?.id,
                username: socket.user?.username
            });
        });
        socket.on('user_stopped_typing', (data) => {
            socket.to(data.chatId).emit('user_stopped_typing', {
                userId: socket.user?.id,
                username: socket.user?.username
            });
        });
        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user?.username}`);
        });
    });
};
exports.socketHandler = socketHandler;
//# sourceMappingURL=socketHandler.js.map