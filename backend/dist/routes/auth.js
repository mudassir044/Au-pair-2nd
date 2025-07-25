"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const index_1 = require("../index");
const jwt_1 = require("../utils/jwt");
const email_1 = require("../utils/email");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        // Validation
        if (!email || !password || !role) {
            return res.status(400).json({ message: 'Email, password, and role are required' });
        }
        if (!['AU_PAIR', 'HOST_FAMILY'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role. Must be AU_PAIR or HOST_FAMILY' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }
        // Check if user already exists
        const existingUser = await index_1.prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }
        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcryptjs_1.default.hash(password, saltRounds);
        // Generate email verification token
        const emailVerifyToken = crypto_1.default.randomBytes(32).toString('hex');
        // Create user
        const user = await index_1.prisma.user.create({
            data: {
                email: email.toLowerCase(),
                password: hashedPassword,
                role,
                emailVerifyToken
            },
            select: {
                id: true,
                email: true,
                role: true,
                isEmailVerified: true,
                createdAt: true
            }
        });
        // Send verification email
        try {
            const emailResult = await (0, email_1.sendVerificationEmail)(user.email, emailVerifyToken);
            console.log('📧 Verification email sent. Preview URL:', emailResult.previewUrl);
        }
        catch (emailError) {
            console.error('Failed to send verification email:', emailError);
            // Don't fail registration if email fails
        }
        // Generate tokens
        const accessToken = (0, jwt_1.generateAccessToken)(user.id);
        const refreshToken = (0, jwt_1.generateRefreshToken)(user.id);
        res.status(201).json({
            message: 'User registered successfully. Please check your email for verification.',
            user,
            accessToken,
            refreshToken
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        // Find user
        const user = await index_1.prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            include: {
                auPairProfile: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        profilePhotoUrl: true
                    }
                },
                hostFamilyProfile: {
                    select: {
                        id: true,
                        familyName: true,
                        contactPersonName: true,
                        profilePhotoUrl: true
                    }
                }
            }
        });
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'Invalid credentials or account deactivated' });
        }
        // Verify password
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Update last login
        await index_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() }
        });
        // Generate tokens
        const accessToken = (0, jwt_1.generateAccessToken)(user.id);
        const refreshToken = (0, jwt_1.generateRefreshToken)(user.id);
        const { password: _, emailVerifyToken, resetPasswordToken, resetPasswordExpires, ...userWithoutSensitiveData } = user;
        res.json({
            message: 'Login successful',
            user: userWithoutSensitiveData,
            accessToken,
            refreshToken
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token is required' });
        }
        const decoded = (0, jwt_1.verifyRefreshToken)(refreshToken);
        const user = await index_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, isActive: true }
        });
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'Invalid refresh token or user deactivated' });
        }
        const newAccessToken = (0, jwt_1.generateAccessToken)(user.id);
        const newRefreshToken = (0, jwt_1.generateRefreshToken)(user.id);
        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        });
    }
    catch (error) {
        res.status(401).json({ message: 'Invalid refresh token' });
    }
});
// Verify email
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ message: 'Verification token is required' });
        }
        const user = await index_1.prisma.user.findFirst({
            where: { emailVerifyToken: token }
        });
        if (!user) {
            return res.status(400).json({ message: 'Invalid verification token' });
        }
        await index_1.prisma.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                emailVerifyToken: null
            }
        });
        res.json({ message: 'Email verified successfully' });
    }
    catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Request password reset
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        const user = await index_1.prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });
        if (!user) {
            // Don't reveal if email exists or not
            return res.json({ message: 'If the email exists, a password reset link has been sent' });
        }
        const resetToken = crypto_1.default.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await index_1.prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: resetToken,
                resetPasswordExpires: resetExpires
            }
        });
        try {
            const emailResult = await (0, email_1.sendPasswordResetEmail)(user.email, resetToken);
            console.log('📧 Password reset email sent. Preview URL:', emailResult.previewUrl);
        }
        catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
        }
        res.json({ message: 'If the email exists, a password reset link has been sent' });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ message: 'Token and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }
        const user = await index_1.prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: {
                    gt: new Date()
                }
            }
        });
        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 12);
        await index_1.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            }
        });
        res.json({ message: 'Password reset successfully' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get current user
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await index_1.prisma.user.findUnique({
            where: { id: req.user.id },
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
                        id: true,
                        firstName: true,
                        lastName: true,
                        profilePhotoUrl: true,
                        bio: true
                    }
                },
                hostFamilyProfile: {
                    select: {
                        id: true,
                        familyName: true,
                        contactPersonName: true,
                        profilePhotoUrl: true,
                        bio: true
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user });
    }
    catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
