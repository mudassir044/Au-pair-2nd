"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketHandlers = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_1 = require("../index");
const setupSocketHandlers = (io) => {
    // Authentication middleware for socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_ACCESS_SECRET);
            const user = await index_1.prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, role: true, isActive: true }
            });
            if (!user || !user.isActive) {
                return next(new Error('Authentication error: Invalid user'));
            }
            socket.userId = user.id;
            socket.userRole = user.role;
            next();
        }
        catch (error) {
            next(new Error('Authentication error: Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        console.log(`User ${socket.userId} connected to socket`);
        // Join user to their personal room
        socket.join(`user_${socket.userId}`);
        // Handle joining conversation rooms
        socket.on('join_conversation', (data) => {
            const { receiverId } = data;
            const roomId = [socket.userId, receiverId].sort().join('_');
            socket.join(roomId);
            console.log(`User ${socket.userId} joined conversation room: ${roomId}`);
        });
        // Handle leaving conversation rooms
        socket.on('leave_conversation', (data) => {
            const { receiverId } = data;
            const roomId = [socket.userId, receiverId].sort().join('_');
            socket.leave(roomId);
            console.log(`User ${socket.userId} left conversation room: ${roomId}`);
        });
        // Handle sending messages
        socket.on('send_message', async (data) => {
            try {
                const { receiverId, content } = data;
                if (!receiverId || !content?.trim()) {
                    socket.emit('error', { message: 'Invalid message data' });
                    return;
                }
                // Verify receiver exists and both users can communicate
                const receiver = await index_1.prisma.user.findUnique({
                    where: { id: receiverId },
                    select: { id: true, isActive: true }
                });
                if (!receiver || !receiver.isActive) {
                    socket.emit('error', { message: 'Receiver not found or inactive' });
                    return;
                }
                // Check if users have an approved match (optional business logic)
                const existingMatch = await index_1.prisma.match.findFirst({
                    where: {
                        OR: [
                            { hostId: socket.userId, auPairId: receiverId, status: 'APPROVED' },
                            { hostId: receiverId, auPairId: socket.userId, status: 'APPROVED' }
                        ]
                    }
                });
                if (!existingMatch) {
                    socket.emit('error', { message: 'You can only message users you have a match with' });
                    return;
                }
                // Create message in database
                const message = await index_1.prisma.message.create({
                    data: {
                        senderId: socket.userId,
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
                const roomId = [socket.userId, receiverId].sort().join('_');
                // Emit to conversation room
                io.to(roomId).emit('new_message', {
                    id: message.id,
                    content: message.content,
                    senderId: message.senderId,
                    receiverId: message.receiverId,
                    createdAt: message.createdAt,
                    sender: message.sender
                });
                // Emit notification to receiver's personal room
                io.to(`user_${receiverId}`).emit('message_notification', {
                    messageId: message.id,
                    senderId: socket.userId,
                    senderName: message.sender.role === 'AU_PAIR'
                        ? `${message.sender.auPairProfile?.firstName} ${message.sender.auPairProfile?.lastName}`
                        : message.sender.hostFamilyProfile?.contactPersonName,
                    preview: content.length > 50 ? content.substring(0, 47) + '...' : content
                });
            }
            catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        // Handle typing indicators
        socket.on('typing_start', (data) => {
            const { receiverId } = data;
            const roomId = [socket.userId, receiverId].sort().join('_');
            socket.to(roomId).emit('user_typing', { userId: socket.userId });
        });
        socket.on('typing_stop', (data) => {
            const { receiverId } = data;
            const roomId = [socket.userId, receiverId].sort().join('_');
            socket.to(roomId).emit('user_stopped_typing', { userId: socket.userId });
        });
        // Handle marking messages as read
        socket.on('mark_messages_read', async (data) => {
            try {
                const { senderId } = data;
                await index_1.prisma.message.updateMany({
                    where: {
                        senderId,
                        receiverId: socket.userId,
                        isRead: false
                    },
                    data: {
                        isRead: true
                    }
                });
                // Notify sender that messages were read
                io.to(`user_${senderId}`).emit('messages_marked_read', {
                    readBy: socket.userId
                });
            }
            catch (error) {
                console.error('Mark messages read error:', error);
                socket.emit('error', { message: 'Failed to mark messages as read' });
            }
        });
        // Handle getting online users (for a conversation)
        socket.on('get_online_status', (data) => {
            const { userIds } = data;
            const onlineUsers = [];
            userIds.forEach(userId => {
                const userSockets = io.sockets.adapter.rooms.get(`user_${userId}`);
                if (userSockets && userSockets.size > 0) {
                    onlineUsers.push(userId);
                }
            });
            socket.emit('online_status', { onlineUsers });
        });
        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User ${socket.userId} disconnected from socket`);
        });
    });
};
exports.setupSocketHandlers = setupSocketHandlers;
