import express from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Create a booking request
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const {
      targetUserId,
      startDate,
      endDate,
      totalHours,
      hourlyRate,
      currency,
      notes
    } = req.body;

    // Validation
    if (!targetUserId || !startDate || !endDate) {
      return res.status(400).json({ message: 'Target user, start date, and end date are required' });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    if (new Date(startDate) < new Date()) {
      return res.status(400).json({ message: 'Start date cannot be in the past' });
    }

    // Verify target user exists and has opposite role
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, isActive: true }
    });

    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({ message: 'Target user not found or inactive' });
    }

    // Verify roles are compatible
    if ((userRole === 'AU_PAIR' && targetUser.role !== 'HOST_FAMILY') ||
        (userRole === 'HOST_FAMILY' && targetUser.role !== 'AU_PAIR')) {
      return res.status(400).json({ message: 'Bookings can only be made between au pairs and host families' });
    }

    // Verify that users have an approved match
    const match = await prisma.match.findFirst({
      where: {
        OR: [
          { hostId: userRole === 'HOST_FAMILY' ? userId : targetUserId, auPairId: userRole === 'AU_PAIR' ? userId : targetUserId, status: 'APPROVED' }
        ]
      }
    });

    if (!match) {
      return res.status(403).json({ message: 'You can only create bookings with users you have an approved match with' });
    }

    // Check for conflicting bookings
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        auPairId: userRole === 'AU_PAIR' ? userId : targetUserId,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          {
            AND: [
              { startDate: { lte: new Date(startDate) } },
              { endDate: { gte: new Date(startDate) } }
            ]
          },
          {
            AND: [
              { startDate: { lte: new Date(endDate) } },
              { endDate: { gte: new Date(endDate) } }
            ]
          },
          {
            AND: [
              { startDate: { gte: new Date(startDate) } },
              { endDate: { lte: new Date(endDate) } }
            ]
          }
        ]
      }
    });

    if (conflictingBooking) {
      return res.status(400).json({ message: 'There is a conflicting booking for this time period' });
    }

    // Calculate total amount
    let totalAmount = null;
    if (totalHours && hourlyRate) {
      totalAmount = parseFloat(totalHours) * parseFloat(hourlyRate);
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        auPairId: userRole === 'AU_PAIR' ? userId : targetUserId,
        hostId: userRole === 'HOST_FAMILY' ? userId : targetUserId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalHours: totalHours ? parseFloat(totalHours) : null,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
        totalAmount,
        currency: currency || 'USD',
        notes,
        status: 'PENDING'
      },
      include: {
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true, profilePhotoUrl: true }
            }
          }
        },
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
            }
          }
        }
      }
    });

    res.status(201).json({ message: 'Booking request created successfully', booking });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's bookings
router.get('/my-bookings', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const status = req.query.status as string;
    const upcoming = req.query.upcoming === 'true';

    const whereClause: any = {};
    
    if (userRole === 'AU_PAIR') {
      whereClause.auPairId = userId;
    } else if (userRole === 'HOST_FAMILY') {
      whereClause.hostId = userId;
    }

    if (status) {
      whereClause.status = status;
    }

    if (upcoming) {
      whereClause.startDate = { gte: new Date() };
    }

    const bookings = await prisma.booking.findMany({
      where: whereClause,
      include: {
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true, profilePhotoUrl: true }
            }
          }
        },
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
            }
          }
        }
      },
      orderBy: { startDate: 'asc' }
    });

    res.json({ bookings });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get booking by ID
router.get('/:bookingId', async (req: AuthRequest, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user!.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true, profilePhotoUrl: true }
            }
          }
        },
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
            }
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify user is part of this booking
    if (booking.auPairId !== userId && booking.hostId !== userId) {
      return res.status(403).json({ message: 'You can only view bookings you are part of' });
    }

    res.json({ booking });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update booking status
router.put('/:bookingId/status', async (req: AuthRequest, res) => {
  try {
    const { bookingId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user!.id;

    if (!['APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ 
        message: 'Status must be APPROVED, REJECTED, CANCELLED, or COMPLETED' 
      });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify user is part of this booking
    if (booking.auPairId !== userId && booking.hostId !== userId) {
      return res.status(403).json({ message: 'You can only update bookings you are part of' });
    }

    // Business logic for status changes
    if (status === 'COMPLETED' && booking.endDate > new Date()) {
      return res.status(400).json({ message: 'Cannot mark booking as completed before end date' });
    }

    if (status === 'APPROVED' && booking.startDate < new Date()) {
      return res.status(400).json({ message: 'Cannot approve a booking that has already started' });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        notes: notes || booking.notes,
        updatedAt: new Date()
      },
      include: {
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true, profilePhotoUrl: true }
            }
          }
        },
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
            }
          }
        }
      }
    });

    res.json({ message: 'Booking status updated successfully', booking: updatedBooking });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update booking details
router.put('/:bookingId', async (req: AuthRequest, res) => {
  try {
    const { bookingId } = req.params;
    const {
      startDate,
      endDate,
      totalHours,
      hourlyRate,
      currency,
      notes
    } = req.body;
    const userId = req.user!.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify user is part of this booking
    if (booking.auPairId !== userId && booking.hostId !== userId) {
      return res.status(403).json({ message: 'You can only update bookings you are part of' });
    }

    // Only allow updates for pending bookings
    if (booking.status !== 'PENDING') {
      return res.status(400).json({ message: 'Can only update pending bookings' });
    }

    // Validation
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    if (startDate && new Date(startDate) < new Date()) {
      return res.status(400).json({ message: 'Start date cannot be in the past' });
    }

    // Calculate total amount if hours and rate are provided
    let totalAmount = booking.totalAmount;
    if (totalHours && hourlyRate) {
      totalAmount = parseFloat(totalHours) * parseFloat(hourlyRate);
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(totalHours && { totalHours: parseFloat(totalHours) }),
        ...(hourlyRate && { hourlyRate: parseFloat(hourlyRate) }),
        ...(currency && { currency }),
        ...(notes !== undefined && { notes }),
        ...(totalAmount !== booking.totalAmount && { totalAmount }),
        updatedAt: new Date()
      },
      include: {
        auPair: {
          select: {
            id: true,
            email: true,
            auPairProfile: {
              select: { firstName: true, lastName: true, profilePhotoUrl: true }
            }
          }
        },
        host: {
          select: {
            id: true,
            email: true,
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true, profilePhotoUrl: true }
            }
          }
        }
      }
    });

    res.json({ message: 'Booking updated successfully', booking: updatedBooking });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete booking
router.delete('/:bookingId', async (req: AuthRequest, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user!.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify user is part of this booking
    if (booking.auPairId !== userId && booking.hostId !== userId) {
      return res.status(403).json({ message: 'You can only delete bookings you are part of' });
    }

    // Only allow deletion of pending or rejected bookings
    if (!['PENDING', 'REJECTED', 'CANCELLED'].includes(booking.status)) {
      return res.status(400).json({ message: 'Can only delete pending, rejected, or cancelled bookings' });
    }

    await prisma.booking.delete({
      where: { id: bookingId }
    });

    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get au pair's availability (upcoming bookings)
router.get('/au-pair/:auPairId/availability', async (req: AuthRequest, res) => {
  try {
    const { auPairId } = req.params;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Verify au pair exists
    const auPair = await prisma.user.findUnique({
      where: { id: auPairId, role: 'AU_PAIR' },
      select: { id: true, isActive: true }
    });

    if (!auPair || !auPair.isActive) {
      return res.status(404).json({ message: 'Au pair not found or inactive' });
    }

    const whereClause: any = {
      auPairId,
      status: { in: ['PENDING', 'APPROVED'] }
    };

    if (startDate && endDate) {
      whereClause.OR = [
        {
          AND: [
            { startDate: { lte: new Date(endDate) } },
            { endDate: { gte: new Date(startDate) } }
          ]
        }
      ];
    } else {
      whereClause.startDate = { gte: new Date() };
    }

    const bookedSlots = await prisma.booking.findMany({
      where: whereClause,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true
      },
      orderBy: { startDate: 'asc' }
    });

    res.json({ bookedSlots });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;