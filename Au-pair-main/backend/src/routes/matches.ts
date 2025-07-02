import express from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { findMatches, calculateMatchScore } from '../utils/matching';

const router = express.Router();

// Get potential matches for current user
router.get('/potential', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;

    const matches = await findMatches(userId, limit);

    res.json({ matches });
  } catch (error) {
    console.error('Get potential matches error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's existing matches
router.get('/my-matches', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const status = req.query.status as string;

    const whereClause: any = {
      OR: [
        { hostId: userId },
        { auPairId: userId }
      ]
    };

    if (status) {
      whereClause.status = status;
    }

    const matches = await prisma.match.findMany({
      where: whereClause,
      include: {
        host: {
          select: {
            id: true,
            email: true,
            role: true,
            hostFamilyProfile: true
          }
        },
        auPair: {
          select: {
            id: true,
            email: true,
            role: true,
            auPairProfile: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ matches });
  } catch (error) {
    console.error('Get my matches error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create a match (send match request)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { targetUserId, notes } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: 'Target user ID is required' });
    }

    if (targetUserId === userId) {
      return res.status(400).json({ message: 'Cannot match with yourself' });
    }

    // Verify target user exists and has opposite role
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { 
        id: true, 
        role: true, 
        isActive: true,
        auPairProfile: true,
        hostFamilyProfile: true
      }
    });

    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({ message: 'Target user not found or inactive' });
    }

    // Verify roles are compatible
    if ((userRole === 'AU_PAIR' && targetUser.role !== 'HOST_FAMILY') ||
        (userRole === 'HOST_FAMILY' && targetUser.role !== 'AU_PAIR')) {
      return res.status(400).json({ message: 'Can only match au pairs with host families' });
    }

    // Check if match already exists
    const existingMatch = await prisma.match.findFirst({
      where: {
        OR: [
          { hostId: userRole === 'HOST_FAMILY' ? userId : targetUserId, auPairId: userRole === 'AU_PAIR' ? userId : targetUserId }
        ]
      }
    });

    if (existingMatch) {
      return res.status(400).json({ message: 'Match already exists between these users' });
    }

    // Get profiles for match score calculation
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        auPairProfile: true,
        hostFamilyProfile: true
      }
    });

    // Calculate match score
    let matchScore = 0;
    if (userRole === 'AU_PAIR' && currentUser?.auPairProfile && targetUser.hostFamilyProfile) {
      matchScore = calculateMatchScore(currentUser.auPairProfile, targetUser.hostFamilyProfile);
    } else if (userRole === 'HOST_FAMILY' && currentUser?.hostFamilyProfile && targetUser.auPairProfile) {
      matchScore = calculateMatchScore(targetUser.auPairProfile, currentUser.hostFamilyProfile);
    }

    // Create match
    const match = await prisma.match.create({
      data: {
        hostId: userRole === 'HOST_FAMILY' ? userId : targetUserId,
        auPairId: userRole === 'AU_PAIR' ? userId : targetUserId,
        matchScore,
        initiatedBy: userRole,
        notes,
        status: 'PENDING'
      },
      include: {
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
            }
          }
        },
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true, profilePhotoUrl: true }
            }
          }
        }
      }
    });

    res.status(201).json({ message: 'Match request sent successfully', match });
  } catch (error) {
    console.error('Create match error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update match status (approve/reject)
router.put('/:matchId/status', async (req: AuthRequest, res) => {
  try {
    const { matchId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user!.id;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: 'Status must be APPROVED or REJECTED' });
    }

    // Find the match
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        host: { select: { id: true } },
        auPair: { select: { id: true } }
      }
    });

    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    // Verify user is part of this match
    if (match.hostId !== userId && match.auPairId !== userId) {
      return res.status(403).json({ message: 'You can only update matches you are part of' });
    }

    // Update match status
    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: { 
        status,
        notes: notes || match.notes,
        updatedAt: new Date()
      },
      include: {
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
            }
          }
        },
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true, profilePhotoUrl: true }
            }
          }
        }
      }
    });

    res.json({ message: 'Match status updated successfully', match: updatedMatch });
  } catch (error) {
    console.error('Update match status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a match
router.delete('/:matchId', async (req: AuthRequest, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user!.id;

    // Find the match
    const match = await prisma.match.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    // Verify user is part of this match
    if (match.hostId !== userId && match.auPairId !== userId) {
      return res.status(403).json({ message: 'You can only delete matches you are part of' });
    }

    await prisma.match.delete({
      where: { id: matchId }
    });

    res.json({ message: 'Match deleted successfully' });
  } catch (error) {
    console.error('Delete match error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;