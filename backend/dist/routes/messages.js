"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const index_1 = require("../index");
const router = express_1.default.Router();
// Get conversations for current user
router.get('/conversations', async (req, res) => {
    try {
        const userId = req.user.id;
        // Get all messages where user is sender or receiver
        const messages = await index_1.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId },
                    { receiverId: userId }
                ]
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        auPairProfile: {
                            select: { firstName: true, lastName: true, profilePhotoUrl: true }
                        },
                        hostFamilyProfile: {
                            select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
                        }
                    }
                },
                receiver: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        auPairProfile: {
                            select: { firstName: true, lastName: true, profilePhotoUrl: true }
                        },
                        hostFamilyProfile: {
                            select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        // Group messages by conversation (other user)
        const conversationsMap = new Map();
        messages.forEach(message => {
            const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
            const otherUser = message.senderId === userId ? message.receiver : message.sender;
            if (!conversationsMap.has(otherUserId)) {
                conversationsMap.set(otherUserId, {
                    userId: otherUserId,
                    user: otherUser,
                    lastMessage: message,
                    unreadCount: 0
                });
            }
            // Count unread messages (messages sent to current user that are unread)
            if (message.receiverId === userId && !message.isRead) {
                const conversation = conversationsMap.get(otherUserId);
                conversation.unreadCount++;
            }
        });
        const conversations = Array.from(conversationsMap.values());
        res.json({ conversations });
    }
    catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get messages between current user and another user
router.get('/conversation/:userId', async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { userId: otherUserId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        // Verify that users have an approved match
        const match = await index_1.prisma.match.findFirst({
            where: {
                OR: [
                    { hostId: currentUserId, auPairId: otherUserId, status: 'APPROVED' },
                    { hostId: otherUserId, auPairId: currentUserId, status: 'APPROVED' }
                ]
            }
        });
        if (!match) {
            return res.status(403).json({ message: 'You can only message users you have an approved match with' });
        }
        const messages = await index_1.prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: otherUserId },
                    { senderId: otherUserId, receiverId: currentUserId }
                ]
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        auPairProfile: {
                            select: { firstName: true, lastName: true, profilePhotoUrl: true }
                        },
                        hostFamilyProfile: {
                            select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        });
        // Mark messages as read (messages sent to current user)
        await index_1.prisma.message.updateMany({
            where: {
                senderId: otherUserId,
                receiverId: currentUserId,
                isRead: false
            },
            data: { isRead: true }
        });
        res.json({ messages: messages.reverse() }); // Reverse to show oldest first
    }
    catch (error) {
        console.error('Get conversation messages error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Send a message
router.post('/send', async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, content } = req.body;
        if (!receiverId || !content?.trim()) {
            return res.status(400).json({ message: 'Receiver ID and content are required' });
        }
        // Verify receiver exists
        const receiver = await index_1.prisma.user.findUnique({
            where: { id: receiverId },
            select: { id: true, isActive: true }
        });
        if (!receiver || !receiver.isActive) {
            return res.status(404).json({ message: 'Receiver not found or inactive' });
        }
        // Verify that users have an approved match
        const match = await index_1.prisma.match.findFirst({
            where: {
                OR: [
                    { hostId: senderId, auPairId: receiverId, status: 'APPROVED' },
                    { hostId: receiverId, auPairId: senderId, status: 'APPROVED' }
                ]
            }
        });
        if (!match) {
            return res.status(403).json({ message: 'You can only message users you have an approved match with' });
        }
        const message = await index_1.prisma.message.create({
            data: {
                senderId,
                receiverId,
                content: content.trim()
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        auPairProfile: {
                            select: { firstName: true, lastName: true, profilePhotoUrl: true }
                        },
                        hostFamilyProfile: {
                            select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
                        }
                    }
                }
            }
        });
        res.status(201).json({ message: 'Message sent successfully', data: message });
    }
    catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Mark messages as read
router.put('/mark-read', async (req, res) => {
    try {
        const receiverId = req.user.id;
        const { senderId } = req.body;
        if (!senderId) {
            return res.status(400).json({ message: 'Sender ID is required' });
        }
        await index_1.prisma.message.updateMany({
            where: {
                senderId,
                receiverId,
                isRead: false
            },
            data: { isRead: true }
        });
        res.json({ message: 'Messages marked as read' });
    }
    catch (error) {
        console.error('Mark messages read error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get unread message count
router.get('/unread-count', async (req, res) => {
    try {
        const userId = req.user.id;
        const unreadCount = await index_1.prisma.message.count({
            where: {
                receiverId: userId,
                isRead: false
            }
        });
        res.json({ unreadCount });
    }
    catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete a message (only sender can delete)
router.delete('/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;
        const message = await index_1.prisma.message.findUnique({
            where: { id: messageId }
        });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        if (message.senderId !== userId) {
            return res.status(403).json({ message: 'You can only delete messages you sent' });
        }
        await index_1.prisma.message.delete({
            where: { id: messageId }
        });
        res.json({ message: 'Message deleted successfully' });
    }
    catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
