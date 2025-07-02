"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting database seed...');
    // Create an admin user
    const adminPassword = await bcryptjs_1.default.hash('admin123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@aupair.com' },
        update: {},
        create: {
            email: 'admin@aupair.com',
            password: adminPassword,
            role: 'ADMIN',
            isEmailVerified: true,
            isActive: true
        }
    });
    console.log('✅ Admin user created:', admin.email);
    // Create a sample au pair
    const auPairPassword = await bcryptjs_1.default.hash('password123', 12);
    const auPair = await prisma.user.upsert({
        where: { email: 'marie@aupair.com' },
        update: {},
        create: {
            email: 'marie@aupair.com',
            password: auPairPassword,
            role: 'AU_PAIR',
            isEmailVerified: true,
            isActive: true,
            auPairProfile: {
                create: {
                    firstName: 'Marie',
                    lastName: 'Dubois',
                    dateOfBirth: new Date('1998-05-15'),
                    bio: 'Passionate about childcare with 3 years of experience. I love outdoor activities and teaching languages.',
                    languages: JSON.stringify(['French', 'English', 'Spanish']),
                    skills: JSON.stringify(['Childcare', 'Cooking', 'Swimming', 'First Aid']),
                    experience: '3 years of experience working with children aged 2-12',
                    education: 'Bachelor in Early Childhood Education',
                    preferredCountries: JSON.stringify(['USA', 'Canada', 'Australia']),
                    hourlyRate: 15.0,
                    currency: 'USD',
                    availableFrom: new Date('2025-03-01'),
                    availableTo: new Date('2025-12-31')
                }
            }
        }
    });
    console.log('✅ Au pair user created:', auPair.email);
    // Create a sample host family
    const hostPassword = await bcryptjs_1.default.hash('password123', 12);
    const hostFamily = await prisma.user.upsert({
        where: { email: 'johnson@family.com' },
        update: {},
        create: {
            email: 'johnson@family.com',
            password: hostPassword,
            role: 'HOST_FAMILY',
            isEmailVerified: true,
            isActive: true,
            hostFamilyProfile: {
                create: {
                    familyName: 'Johnson Family',
                    contactPersonName: 'Sarah Johnson',
                    bio: 'We are a loving family of four looking for a caring au pair to help with our children.',
                    location: 'San Francisco, CA',
                    country: 'USA',
                    numberOfChildren: 2,
                    childrenAges: JSON.stringify([5, 8]),
                    requirements: 'Must be comfortable with pets, non-smoker preferred',
                    preferredLanguages: JSON.stringify(['English', 'French']),
                    maxBudget: 20.0,
                    currency: 'USD'
                }
            }
        }
    });
    console.log('✅ Host family user created:', hostFamily.email);
    console.log('🎉 Database seed completed successfully!');
}
main()
    .catch((e) => {
    console.error('❌ Database seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
