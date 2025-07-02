"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const index_1 = require("../index");
const router = express_1.default.Router();
// Create or update Au Pair profile
router.post('/au-pair', async (req, res) => {
    try {
        const userId = req.user.id;
        const { firstName, lastName, dateOfBirth, bio, languages, skills, experience, education, videoUrl, preferredCountries, hourlyRate, currency, availableFrom, availableTo, profilePhotoUrl } = req.body;
        // Validation
        if (!firstName || !lastName || !dateOfBirth) {
            return res.status(400).json({ message: 'First name, last name, and date of birth are required' });
        }
        // Check if user is an au pair
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        if (!user || user.role !== 'AU_PAIR') {
            return res.status(403).json({ message: 'Only au pairs can create au pair profiles' });
        }
        // Create or update profile
        const profile = await index_1.prisma.auPairProfile.upsert({
            where: { userId },
            create: {
                userId,
                firstName,
                lastName,
                dateOfBirth: new Date(dateOfBirth),
                bio,
                languages: languages || [],
                skills: skills || [],
                experience,
                education,
                videoUrl,
                preferredCountries: preferredCountries || [],
                hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
                currency: currency || 'USD',
                availableFrom: availableFrom ? new Date(availableFrom) : null,
                availableTo: availableTo ? new Date(availableTo) : null,
                profilePhotoUrl
            },
            update: {
                firstName,
                lastName,
                dateOfBirth: new Date(dateOfBirth),
                bio,
                languages: languages || [],
                skills: skills || [],
                experience,
                education,
                videoUrl,
                preferredCountries: preferredCountries || [],
                hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
                currency: currency || 'USD',
                availableFrom: availableFrom ? new Date(availableFrom) : null,
                availableTo: availableTo ? new Date(availableTo) : null,
                profilePhotoUrl
            }
        });
        res.json({ message: 'Au pair profile saved successfully', profile });
    }
    catch (error) {
        console.error('Au pair profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Create or update Host Family profile
router.post('/host-family', async (req, res) => {
    try {
        const userId = req.user.id;
        const { familyName, contactPersonName, bio, location, country, numberOfChildren, childrenAges, requirements, preferredLanguages, maxBudget, currency, profilePhotoUrl } = req.body;
        // Validation
        if (!familyName || !contactPersonName || !location || !country || !numberOfChildren) {
            return res.status(400).json({
                message: 'Family name, contact person, location, country, and number of children are required'
            });
        }
        // Check if user is a host family
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        if (!user || user.role !== 'HOST_FAMILY') {
            return res.status(403).json({ message: 'Only host families can create host family profiles' });
        }
        // Create or update profile
        const profile = await index_1.prisma.hostFamilyProfile.upsert({
            where: { userId },
            create: {
                userId,
                familyName,
                contactPersonName,
                bio,
                location,
                country,
                numberOfChildren: parseInt(numberOfChildren),
                childrenAges: childrenAges || [],
                requirements,
                preferredLanguages: preferredLanguages || [],
                maxBudget: maxBudget ? parseFloat(maxBudget) : null,
                currency: currency || 'USD',
                profilePhotoUrl
            },
            update: {
                familyName,
                contactPersonName,
                bio,
                location,
                country,
                numberOfChildren: parseInt(numberOfChildren),
                childrenAges: childrenAges || [],
                requirements,
                preferredLanguages: preferredLanguages || [],
                maxBudget: maxBudget ? parseFloat(maxBudget) : null,
                currency: currency || 'USD',
                profilePhotoUrl
            }
        });
        res.json({ message: 'Host family profile saved successfully', profile });
    }
    catch (error) {
        console.error('Host family profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get current user's profile
router.get('/me', async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        let profile = null;
        if (userRole === 'AU_PAIR') {
            profile = await index_1.prisma.auPairProfile.findUnique({
                where: { userId }
            });
        }
        else if (userRole === 'HOST_FAMILY') {
            profile = await index_1.prisma.hostFamilyProfile.findUnique({
                where: { userId }
            });
        }
        res.json({ profile });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get profile by user ID
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, isActive: true }
        });
        if (!user || !user.isActive) {
            return res.status(404).json({ message: 'User not found or inactive' });
        }
        let profile = null;
        if (user.role === 'AU_PAIR') {
            profile = await index_1.prisma.auPairProfile.findUnique({
                where: { userId }
            });
        }
        else if (user.role === 'HOST_FAMILY') {
            profile = await index_1.prisma.hostFamilyProfile.findUnique({
                where: { userId }
            });
        }
        res.json({ profile, userRole: user.role });
    }
    catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete current user's profile
router.delete('/me', async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        if (userRole === 'AU_PAIR') {
            await index_1.prisma.auPairProfile.deleteMany({
                where: { userId }
            });
        }
        else if (userRole === 'HOST_FAMILY') {
            await index_1.prisma.hostFamilyProfile.deleteMany({
                where: { userId }
            });
        }
        res.json({ message: 'Profile deleted successfully' });
    }
    catch (error) {
        console.error('Delete profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
