import multer from 'multer';
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", any>;
export declare const upload: multer.Multer;
export declare const uploadToSupabase: (file: Express.Multer.File, userId: string, folder?: string) => Promise<string>;
export declare const deleteFromSupabase: (url: string) => Promise<void>;
