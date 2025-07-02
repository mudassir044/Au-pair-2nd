import express from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { upload, uploadToSupabase, deleteFromSupabase } from '../utils/supabase';

const router = express.Router();

// Upload document
router.post('/upload', upload.single('document'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { type } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    if (!type || !['ID', 'PASSPORT', 'VISA', 'PROFILE_PHOTO'].includes(type)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }

    // Check if document of this type already exists
    const existingDocument = await prisma.document.findFirst({
      where: { userId, type }
    });

    let uploadUrl: string;

    try {
      // Upload to Supabase
      uploadUrl = await uploadToSupabase(req.file, userId, 'documents');
    } catch (uploadError) {
      console.error('File upload failed:', uploadError);
      return res.status(500).json({ message: 'File upload failed. Please try again.' });
    }

    if (existingDocument) {
      // Delete old file from Supabase
      try {
        await deleteFromSupabase(existingDocument.url);
      } catch (deleteError) {
        console.error('Failed to delete old file:', deleteError);
        // Continue anyway, don't fail the upload
      }

      // Update existing document
      const document = await prisma.document.update({
        where: { id: existingDocument.id },
        data: {
          filename: req.file.filename || `${Date.now()}_${req.file.originalname}`,
          originalName: req.file.originalname,
          url: uploadUrl,
          status: 'PENDING',
          uploadedAt: new Date()
        }
      });

      res.json({ message: 'Document updated successfully', document });
    } else {
      // Create new document
      const document = await prisma.document.create({
        data: {
          userId,
          type,
          filename: req.file.filename || `${Date.now()}_${req.file.originalname}`,
          originalName: req.file.originalname,
          url: uploadUrl,
          status: 'PENDING'
        }
      });

      res.json({ message: 'Document uploaded successfully', document });
    }
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's documents
router.get('/my-documents', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const documents = await prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        status: true,
        filename: true,
        originalName: true,
        url: true,
        uploadedAt: true,
        verifiedAt: true,
        notes: true
      },
      orderBy: { uploadedAt: 'desc' }
    });

    res.json({ documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get documents by user ID (for admin or matched users)
router.get('/user/:userId', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.id;
    const currentUserRole = req.user!.role;

    // Check if current user has permission to view documents
    let hasPermission = false;

    if (currentUserRole === 'ADMIN') {
      hasPermission = true;
    } else if (currentUserId !== userId) {
      // Check if users have an approved match
      const match = await prisma.match.findFirst({
        where: {
          OR: [
            { hostId: currentUserId, auPairId: userId, status: 'APPROVED' },
            { hostId: userId, auPairId: currentUserId, status: 'APPROVED' }
          ]
        }
      });
      hasPermission = !!match;
    } else {
      hasPermission = true; // User viewing their own documents
    }

    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to view these documents' });
    }

    const documents = await prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        status: true,
        filename: true,
        originalName: true,
        url: currentUserRole === 'ADMIN' || currentUserId === userId ? true : false, // Hide URLs from non-admin non-owners
        uploadedAt: true,
        verifiedAt: true,
        notes: currentUserRole === 'ADMIN' ? true : false // Only admin sees verification notes
      },
      orderBy: { uploadedAt: 'desc' }
    });

    res.json({ documents });
  } catch (error) {
    console.error('Get user documents error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update document status (admin only)
router.put('/:documentId/status', async (req: AuthRequest, res) => {
  try {
    const { documentId } = req.params;
    const { status, notes } = req.body;
    const currentUserRole = req.user!.role;

    if (currentUserRole !== 'ADMIN') {
      return res.status(403).json({ message: 'Only admins can update document status' });
    }

    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be PENDING, VERIFIED, or REJECTED' });
    }

    const document = await prisma.document.update({
      where: { id: documentId },
      data: {
        status,
        notes,
        verifiedAt: status === 'VERIFIED' ? new Date() : null,
        verifiedBy: status === 'VERIFIED' ? req.user!.id : null
      }
    });

    res.json({ message: 'Document status updated successfully', document });
  } catch (error) {
    console.error('Update document status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete document
router.delete('/:documentId', async (req: AuthRequest, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check permission: user can delete their own documents, admin can delete any
    if (document.userId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ message: 'You can only delete your own documents' });
    }

    // Delete file from Supabase
    try {
      await deleteFromSupabase(document.url);
    } catch (deleteError) {
      console.error('Failed to delete file from storage:', deleteError);
      // Continue with database deletion even if file deletion fails
    }

    // Delete from database
    await prisma.document.delete({
      where: { id: documentId }
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all documents (admin only)
router.get('/all', async (req: AuthRequest, res) => {
  try {
    const currentUserRole = req.user!.role;

    if (currentUserRole !== 'ADMIN') {
      return res.status(403).json({ message: 'Only admins can view all documents' });
    }

    const status = req.query.status as string;
    const type = req.query.type as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (type) whereClause.type = type;

    const documents = await prisma.document.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            auPairProfile: {
              select: { firstName: true, lastName: true }
            },
            hostFamilyProfile: {
              select: { familyName: true, contactPersonName: true }
            }
          }
        }
      },
      orderBy: { uploadedAt: 'desc' },
      take: limit,
      skip: offset
    });

    const totalCount = await prisma.document.count({ where: whereClause });

    res.json({
      documents,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get all documents error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;