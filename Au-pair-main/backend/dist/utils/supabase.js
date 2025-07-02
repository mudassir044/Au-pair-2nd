"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFromSupabase = exports.uploadToSupabase = exports.upload = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const multer_1 = __importDefault(require("multer"));
// Initialize Supabase client with anonymous access for development
const supabaseUrl = process.env.SUPABASE_URL || 'https://demo-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'demo-key';
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
// Multer configuration for file uploads
exports.upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow images and PDFs
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        else {
            cb(new Error('Only images and PDF files are allowed'));
        }
    },
});
const uploadToSupabase = async (file, userId, folder = 'documents') => {
    try {
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExtension}`;
        const filePath = `${folder}/${fileName}`;
        const { data, error } = await exports.supabase.storage
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
        const { data: { publicUrl } } = exports.supabase.storage
            .from('uploads')
            .getPublicUrl(filePath);
        return publicUrl;
    }
    catch (error) {
        console.error('File upload error:', error);
        throw error;
    }
};
exports.uploadToSupabase = uploadToSupabase;
const deleteFromSupabase = async (url) => {
    try {
        // Extract file path from URL
        const urlParts = url.split('/storage/v1/object/public/uploads/');
        if (urlParts.length < 2) {
            throw new Error('Invalid file URL');
        }
        const filePath = urlParts[1];
        const { error } = await exports.supabase.storage
            .from('uploads')
            .remove([filePath]);
        if (error) {
            console.error('Supabase delete error:', error);
            throw new Error(`Delete failed: ${error.message}`);
        }
    }
    catch (error) {
        console.error('File delete error:', error);
        throw error;
    }
};
exports.deleteFromSupabase = deleteFromSupabase;
