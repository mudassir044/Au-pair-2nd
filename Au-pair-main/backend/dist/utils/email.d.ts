export declare const createEmailTransporter: () => Promise<any>;
export declare const sendVerificationEmail: (email: string, token: string) => Promise<{
    messageId: any;
    previewUrl: string | false;
}>;
export declare const sendPasswordResetEmail: (email: string, token: string) => Promise<{
    messageId: any;
    previewUrl: string | false;
}>;
