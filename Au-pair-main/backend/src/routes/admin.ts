import express from 'express';
import { prisma } from '../index';
import { AuthRequest, roleMiddleware } from '../middleware/auth';

const router = express.Router();

// Apply admin role middleware to all routes
router.use(roleMiddleware(['ADMIN']));

// Get dashboard statistics
router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const [
      totalUsers,
      auPairs,
      hostFamilies,
      totalMatches,
      approvedMatches,
      pendingMatches,
      totalBookings,
      approvedBookings,
      pendingBookings,
      totalDocuments,
      pendingDocuments,
      verifiedDocuments,
      totalMessages
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'AU_PAIR' } }),
      prisma.user.count({ where: { role: 'HOST_FAMILY' } }),
      prisma.match.count(),
      prisma.match.count({ where: { status: 'APPROVED' } }),
      prisma.match.count({ where: { status: 'PENDING' } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'APPROVED' } }),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.document.count(),
      prisma.document.count({ where: { status: 'PENDING' } }),
      prisma.document.count({ where: { status: 'VERIFIED' } }),
      prisma.message.count()
    ]);

    // Get recent activity
    const recentUsers = await prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        isActive: true,
        auPairProfile: {
          select: { firstName: true, lastName: true }
        },
        hostFamilyProfile: {
          select: { familyName: true, contactPersonName: true }
        }
      }
    });

    const recentMatches = await prisma.match.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true }
            }
          }
        },
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true }
            }
          }
        }
      }
    });

    const stats = {
      users: {
        total: totalUsers,
        auPairs,
        hostFamilies,
        activeUsers: totalUsers // Simplified - could filter by isActive
      },
      matches: {
        total: totalMatches,
        approved: approvedMatches,
        pending: pendingMatches,
        rejected: totalMatches - approvedMatches - pendingMatches
      },
      bookings: {
        total: totalBookings,
        approved: approvedBookings,
        pending: pendingBookings
      },
      documents: {
        total: totalDocuments,
        pending: pendingDocuments,
        verified: verifiedDocuments,
        rejected: totalDocuments - pendingDocuments - verifiedDocuments
      },
      messages: {
        total: totalMessages
      }
    };

    res.json({
      stats,
      recentActivity: {
        users: recentUsers,
        matches: recentMatches
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all users with pagination and filters
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const role = req.query.role as string;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    
    if (role && ['AU_PAIR', 'HOST_FAMILY', 'ADMIN'].includes(role)) {
      whereClause.role = role;
    }
    
    if (status === 'active') {
      whereClause.isActive = true;
    } else if (status === 'inactive') {
      whereClause.isActive = false;
    }
    
    if (search) {
      whereClause.email = {
        contains: search,
        mode: 'insensitive'
      };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      include: {
        auPairProfile: {
          select: { firstName: true, lastName: true, profilePhotoUrl: true }
        },
        hostFamilyProfile: {
          select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
        },
        _count: {
          select: {
            documents: true,
            sentMessages: true,
            hostMatches: true,
            auPairMatches: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    const totalCount = await prisma.user.count({ where: whereClause });

    res.json({
      users,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user status
router.put('/users/:userId/status', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        isActive: true,
        role: true
      }
    });

    res.json({ message: 'User status updated successfully', user });
  } catch (error) {
    console.error('Update user status error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all matches with filters
router.get('/matches', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      whereClause.status = status;
    }

    const matches = await prisma.match.findMany({
      where: whereClause,
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
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    const totalCount = await prisma.match.count({ where: whereClause });

    res.json({
      matches,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get admin matches error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all bookings with filters
router.get('/bookings', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      whereClause.status = status;
    }

    const bookings = await prisma.booking.findMany({
      where: whereClause,
      include: {
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true }
            }
          }
        },
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    const totalCount = await prisma.booking.count({ where: whereClause });

    res.json({
      bookings,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get admin bookings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting yourself
    if (userId === req.user!.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: userId }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create admin user
router.post('/users/create-admin', async (req: AuthRequest, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'ADMIN',
        isEmailVerified: true // Auto-verify admin accounts
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.status(201).json({ message: 'Admin user created successfully', user });
  } catch (error) {
    console.error('Create admin user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;