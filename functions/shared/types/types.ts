export type VisionData = {
  confidence?: number;
  indicators?: string[];
  reason?: string;
  [key: string]: unknown;
};

export type ProfileCheckResult = {
  username: string;
  isCreator: boolean;
  confidence: number;
  indicators: string[];
  bio: string | null;
  links: string[];
  screenshots: string[];
  errors: string[];
  reason: string | null;
};
