"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const index_1 = require("../index");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Get all users (for admin)
router.get('/', async (req, res) => {
    try {
        const users = await index_1.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                isEmailVerified: true,
                lastLogin: true,
                createdAt: true,
                auPairProfile: {
                    select: {
                        firstName: true,
                        lastName: true,
                        profilePhotoUrl: true
                    }
                },
                hostFamilyProfile: {
                    select: {
                        familyName: true,
                        contactPersonName: true,
                        profilePhotoUrl: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ users });
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get user by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await index_1.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                isEmailVerified: true,
                lastLogin: true,
                createdAt: true,
                auPairProfile: true,
                hostFamilyProfile: true
            }
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user });
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update user status (for admin)
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive must be a boolean' });
        }
        const user = await index_1.prisma.user.update({
            where: { id },
            data: { isActive },
            select: {
                id: true,
                email: true,
                isActive: true
            }
        });
        res.json({ message: 'User status updated successfully', user });
    }
    catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete user account
router.delete('/me', async (req, res) => {
    try {
        const userId = req.user.id;
        // Delete user and all related data (Prisma cascade will handle relationships)
        await index_1.prisma.user.delete({
            where: { id: userId }
        });
        res.json({ message: 'Account deleted successfully' });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
