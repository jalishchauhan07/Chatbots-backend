"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
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
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const customer = await prisma.customer.create({
            data: { name, email, password: hashed }
        });
        const token = jsonwebtoken_1.default.sign({ id: customer.id, username: customer.name, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            token,
            user: { id: customer.id, username: customer.name, email: customer.email, role: 'customer' }
        });
    }
    catch (error) {
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
        const isValidPassword = await bcryptjs_1.default.compare(password, customer.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ id: customer.id, username: customer.name, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: { id: customer.id, username: customer.name, email: customer.email, role: 'customer' }
        });
    }
    catch (error) {
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
        const isValidPassword = await bcryptjs_1.default.compare(password, admin.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: admin.id, username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: {
                id: admin.id,
                username: admin.username
            }
        });
    }
    catch (error) {
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
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        if (decoded.role === 'admin') {
            const admin = await prisma.admin.findUnique({
                where: { id: decoded.id },
                select: { id: true, username: true }
            });
            if (!admin)
                return res.status(401).json({ error: 'Invalid token' });
            return res.json({ user: { ...admin, role: 'admin' } });
        }
        if (decoded.role === 'customer') {
            const customer = await prisma.customer.findUnique({
                where: { id: decoded.id },
                select: { id: true, name: true, email: true }
            });
            if (!customer)
                return res.status(401).json({ error: 'Invalid token' });
            return res.json({ user: { id: customer.id, username: customer.name, email: customer.email, role: 'customer' } });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// Logout (stateless - client clears token)
router.post('/logout', async (_req, res) => {
    try {
        // For stateless JWT, there's nothing to invalidate server-side by default
        // Respond success so client can clear its token
        return res.status(200).json({ success: true });
    }
    catch (_err) {
        return res.status(200).json({ success: true });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map