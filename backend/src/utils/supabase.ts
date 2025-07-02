import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

// Initialize Supabase client with anonymous access for development
const supabaseUrl = process.env.SUPABASE_URL || 'https://demo-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'demo-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Multer configuration for file uploads
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed'));
    }
  },
});

export const uploadToSupabase = async (
  file: Express.Multer.File,
  userId: string,
  folder: string = 'documents'
): Promise<string> => {
  try {
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExtension}`;
    const filePath = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('File upload error:', error);
    throw error;
  }
};

export const deleteFromSupabase = async (url: string): Promise<void> => {
  try {
    // Extract file path from URL
    const urlParts = url.split('/storage/v1/object/public/uploads/');
    if (urlParts.length < 2) {
      throw new Error('Invalid file URL');
    }
    
    const filePath = urlParts[1];

    const { error } = await supabase.storage
      .from('uploads')
      .remove([filePath]);

    if (error) {
      console.error('Supabase delete error:', error);
      throw new Error(`Delete failed: ${error.message}`);
    }
  } catch (error) {
    console.error('File delete error:', error);
    throw error;
  }
};