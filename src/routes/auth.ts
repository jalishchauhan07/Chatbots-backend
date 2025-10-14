import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
// console.log(prisma)
// Customer register
router.post('/customer/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        const existing = await prisma.customer.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const customer = await prisma.customer.create({
            data: { name, email, password: hashed }
        });

        const token = jwt.sign(
            { id: customer.id, username: customer.name, role: 'customer' },
            process.env.JWT_SECRET!,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: { id: customer.id, username: customer.name, email: customer.email, role: 'customer' }
        });
    } catch (error) {
        console.error('Customer register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Customer login
router.post('/customer/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const customer = await prisma.customer.findUnique({ where: { email } });
        if (!customer) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, customer.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: customer.id, username: customer.name, role: 'customer' },
            process.env.JWT_SECRET!,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: customer.id, username: customer.name, email: customer.email, role: 'customer' }
        });
    } catch (error) {
        console.error('Customer login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Admin login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find admin user
        const admin = await prisma.admin.findUnique({
            where: { username }
        });

        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, admin.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: admin.id, username: admin.username, role: 'admin' },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: admin.id,
                username: admin.username
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify token
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

        if (decoded.role === 'admin') {
            const admin = await prisma.admin.findUnique({
                where: { id: decoded.id },
                select: { id: true, username: true }
            });
            if (!admin) return res.status(401).json({ error: 'Invalid token' });
            return res.json({ user: { ...admin, role: 'admin' } });
        }

        if (decoded.role === 'customer') {
            const customer = await prisma.customer.findUnique({
                where: { id: decoded.id },
                select: { id: true, name: true, email: true }
            });
            if (!customer) return res.status(401).json({ error: 'Invalid token' });
            return res.json({ user: { id: customer.id, username: customer.name, email: customer.email, role: 'customer' } });
        }

        return res.status(401).json({ error: 'Invalid token' });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Logout (stateless - client clears token)
router.post('/logout', async (_req, res) => {
    try {
        // For stateless JWT, there's nothing to invalidate server-side by default
        // Respond success so client can clear its token
        return res.status(200).json({ success: true });
    } catch (_err) {
        return res.status(200).json({ success: true });
    }
});

export default router;
