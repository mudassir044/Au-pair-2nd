"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPasswordResetEmail = exports.sendVerificationEmail = exports.createEmailTransporter = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// Create test account using Ethereal Email
const createEmailTransporter = async () => {
    // Generate test SMTP service account from ethereal.email
    const testAccount = await nodemailer_1.default.createTestAccount();
    const transporter = nodemailer_1.default.createTransporter({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user,
            pass: testAccount.pass,
        },
    });
    // Store credentials for reference
    console.log('📧 Ethereal Email Test Account Created:');
    console.log(`Email: ${testAccount.user}`);
    console.log(`Password: ${testAccount.pass}`);
    console.log(`Preview URL: https://ethereal.email`);
    return transporter;
};
exports.createEmailTransporter = createEmailTransporter;
const sendVerificationEmail = async (email, token) => {
    const transporter = await (0, exports.createEmailTransporter)();
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@aupair.com',
        to: email,
        subject: 'Verify your Au-pair account',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Au-pair!</h2>
        <p>Thank you for signing up. Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email Address
        </a>
        <p>If you didn't create an account, you can safely ignore this email.</p>
        <p>This link will expire in 24 hours.</p>
      </div>
    `,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.messageId);
    console.log('📧 Preview URL:', nodemailer_1.default.getTestMessageUrl(info));
    return {
        messageId: info.messageId,
        previewUrl: nodemailer_1.default.getTestMessageUrl(info)
    };
};
exports.sendVerificationEmail = sendVerificationEmail;
const sendPasswordResetEmail = async (email, token) => {
    const transporter = await (0, exports.createEmailTransporter)();
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@aupair.com',
        to: email,
        subject: 'Reset your Au-pair password',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to set a new password:</p>
        <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>This link will expire in 1 hour.</p>
      </div>
    `,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Password reset email sent:', info.messageId);
    console.log('📧 Preview URL:', nodemailer_1.default.getTestMessageUrl(info));
    return {
        messageId: info.messageId,
        previewUrl: nodemailer_1.default.getTestMessageUrl(info)
    };
};
exports.sendPasswordResetEmail = sendPasswordResetEmail;
