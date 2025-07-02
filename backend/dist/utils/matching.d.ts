export interface MatchCriteria {
    languages?: string[];
    availableFrom?: Date;
    availableTo?: Date;
    country?: string;
    minAge?: number;
    maxAge?: number;
}
export declare const calculateMatchScore: (auPairProfile: any, hostProfile: any) => number;
export declare const findMatches: (userId: string, limit?: number) => Promise<any[]>;
