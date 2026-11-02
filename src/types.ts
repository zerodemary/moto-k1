export type Question = { id: string; type: 'single' | 'judge'; stem: string; options: string[]; answer: number; explanation: string; chapter: string; image?: string };
export type Bank = { version: string; name: string; source: string; count: number; questions: Question[] };
