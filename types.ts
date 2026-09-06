export type Persona = 'bhai' | 'didi';

export type MoodType = 'happy' | 'sad' | 'stressed' | 'angry' | 'chill' | 'motivated';

export interface MoodEntry {
  id: string;
  mood: MoodType;
  label: string;
  emoji: string;
  timestamp: number;
  note?: string;
  advice: {
    bhai: string;
    didi: string;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
  moodTag?: MoodType;
}

export interface HistoryItem {
  role: 'user' | 'model';
  parts: { text: string }[];
}
