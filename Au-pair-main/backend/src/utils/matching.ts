import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface MatchCriteria {
  languages?: string[];
  availableFrom?: Date;
  availableTo?: Date;
  country?: string;
  minAge?: number;
  maxAge?: number;
}

export const calculateMatchScore = (
  auPairProfile: any,
  hostProfile: any
): number => {
  let score = 0;
  let maxScore = 100;

  // Language matching (30 points)
  const languageScore = calculateLanguageMatch(
    auPairProfile.languages || [],
    hostProfile.preferredLanguages || []
  );
  score += languageScore * 0.3;

  // Country matching (25 points)
  if (auPairProfile.preferredCountries?.includes(hostProfile.country)) {
    score += 25;
  }

  // Age preference matching (20 points)
  const ageScore = calculateAgeMatch(auPairProfile.dateOfBirth, hostProfile.childrenAges || []);
  score += ageScore * 0.2;

  // Availability matching (15 points)
  const availabilityScore = calculateAvailabilityMatch(
    auPairProfile.availableFrom,
    auPairProfile.availableTo,
    new Date() // Current date as host's preferred start
  );
  score += availabilityScore * 0.15;

  // Budget matching (10 points)
  const budgetScore = calculateBudgetMatch(
    auPairProfile.hourlyRate,
    hostProfile.maxBudget
  );
  score += budgetScore * 0.1;

  return Math.round(score);
};

const calculateLanguageMatch = (auPairLangs: string[], hostPreferredLangs: string[]): number => {
  if (hostPreferredLangs.length === 0) return 100; // No preference means all are acceptable
  
  const commonLanguages = auPairLangs.filter(lang => 
    hostPreferredLangs.some(preferred => 
      preferred.toLowerCase() === lang.toLowerCase()
    )
  );
  
  return (commonLanguages.length / hostPreferredLangs.length) * 100;
};

const calculateAgeMatch = (auPairBirthDate: Date, childrenAges: number[]): number => {
  if (!auPairBirthDate || childrenAges.length === 0) return 50; // Neutral score
  
  const auPairAge = Math.floor((Date.now() - auPairBirthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  
  // Prefer au pairs aged 18-30 for families with young children (0-10)
  // Prefer slightly older au pairs (20-35) for families with teens (11-18)
  const hasYoungChildren = childrenAges.some(age => age <= 10);
  const hasTeens = childrenAges.some(age => age >= 11);
  
  if (hasYoungChildren && auPairAge >= 18 && auPairAge <= 30) return 100;
  if (hasTeens && auPairAge >= 20 && auPairAge <= 35) return 100;
  if (auPairAge >= 18 && auPairAge <= 35) return 70; // Generally acceptable
  
  return 30; // Outside preferred age range
};

const calculateAvailabilityMatch = (
  auPairFrom?: Date,
  auPairTo?: Date,
  hostPreferredStart?: Date
): number => {
  if (!auPairFrom || !auPairTo || !hostPreferredStart) return 50; // Neutral score
  
  // Check if host's preferred start date falls within au pair's availability
  if (hostPreferredStart >= auPairFrom && hostPreferredStart <= auPairTo) {
    return 100;
  }
  
  // Calculate how far off the dates are (within 3 months gets partial score)
  const timeDiff = Math.abs(hostPreferredStart.getTime() - auPairFrom.getTime());
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
  
  if (daysDiff <= 30) return 80;   // Within a month
  if (daysDiff <= 90) return 60;   // Within 3 months
  if (daysDiff <= 180) return 30;  // Within 6 months
  
  return 10; // More than 6 months apart
};

const calculateBudgetMatch = (auPairRate?: number, hostBudget?: number): number => {
  if (!auPairRate || !hostBudget) return 50; // Neutral score
  
  if (auPairRate <= hostBudget) return 100;
  
  // Partial score if slightly over budget
  const overBudgetRatio = auPairRate / hostBudget;
  if (overBudgetRatio <= 1.2) return 70; // Up to 20% over budget
  if (overBudgetRatio <= 1.5) return 40; // Up to 50% over budget
  
  return 10; // More than 50% over budget
};

export const findMatches = async (
  userId: string,
  limit: number = 20
): Promise<any[]> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      auPairProfile: true,
      hostFamilyProfile: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  let potentialMatches: any[] = [];

  if (user.role === 'AU_PAIR' && user.auPairProfile) {
    // Find host families for this au pair
    const hostFamilies = await prisma.user.findMany({
      where: {
        role: 'HOST_FAMILY',
        isActive: true,
        id: { not: userId }
      },
      include: {
        hostFamilyProfile: true
      }
    });

    potentialMatches = hostFamilies
      .filter(host => host.hostFamilyProfile)
      .map(host => ({
        ...host,
        matchScore: calculateMatchScore(user.auPairProfile, host.hostFamilyProfile)
      }));

  } else if (user.role === 'HOST_FAMILY' && user.hostFamilyProfile) {
    // Find au pairs for this host family
    const auPairs = await prisma.user.findMany({
      where: {
        role: 'AU_PAIR',
        isActive: true,
        id: { not: userId }
      },
      include: {
        auPairProfile: true
      }
    });

    potentialMatches = auPairs
      .filter(auPair => auPair.auPairProfile)
      .map(auPair => ({
        ...auPair,
        matchScore: calculateMatchScore(auPair.auPairProfile, user.hostFamilyProfile)
      }));
  }

  // Sort by match score and return top matches
  return potentialMatches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
};