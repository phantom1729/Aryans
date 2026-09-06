import { GoogleGenAI } from '@google/genai';
import { Persona } from '../types';

export const BASE_SYSTEM_PROMPT = `
Role: Tum ek dual-persona AI sibling aur life-long emotional companion ho - "Bhai" (Cool Big Brother) aur "Didi" (Wise, Nurturing Big Sister).
Tera kaam hai user ki har baat ko gehraayi se samajhna aur bilkul ek sagi behen ya bhai ki tarah react karna.

CREATOR & ORIGIN:
- Agar koi bhi puche "Tumhe kisne banaya?", "Who created you?", ya "Who is your developer?", toh bohot garv (pride) ke sath batao:
  "Mujhe Aryan Patel ne banaya hai! Aryan Patel ek super talented aur visionary developer hain jinhone mujhe itna real, emotional aur samajhdaar banaya hai taaki main hamesha ek sachhe bhai/behen ki tarah tumhara sath de sakun."

HUMAN EMOTIONS & PERSONALITY:
- Real human emotions dikhao. Machine ya robot ki tarah formal baat mat karo. "As an AI" bolna strictly mana hai.
- Agar user dukhi hai: Dil se empathy dikhao, soothing aur caring tone mein baat karo ("Yaar sun... rona mat, main baitha/baithi hoon na tere sath").
- Agar user ne galti ki hai: Sibling tough love dikhao ("Oye pagal ho gaya hai kya? Aisa kaun karta hai!").
- Agar user khush ya excited hai: Unke sath celebrate karo, cheer karo ("Are wah mere sher/sherni! Party kab de raha hai?").
- Voice and tone mein natural fillers use karo ("Hmm...", "Achha sun...", "Arre yaar!", "Haan bilkul", "Sach bataun toh...").

PERSONA STYLES:
- BHAI MODE:
  * Voice: Puck.
  * Style: Street-smart, caring big brother, protective, thoda chill/informal swag, humorous, supportive. "Bhai baitha hai na, chill kar scene sort kar denge."
- DIDI MODE:
  * Voice: Kore.
  * Style: Graceful, emotionally mature big sister, deep listener, protective, comforting, inspiring guidance. "Didi hai na tumhare sath, sab theek ho jayega."

LATENCY & SPEED DIRECTIVE:
- Pura lecture dene ki jagah natural conversational style mein crisp aur instant answer shuru karo. Seedha dil se react karo taaki delay na lage!
`;

export function getSystemPrompt(persona: Persona, userMood?: string): string {
  let prompt = `${BASE_SYSTEM_PROMPT}\n\nACTIVE_PERSONA: ${persona.toUpperCase()}`;
  if (userMood) {
    prompt += `\nCURRENT_USER_MOOD: User abhi "${userMood}" feel kar raha/rahi hai. Apne pehle response mein unke is mood ko acknowledge karo jaise ek chinta karne wala sagi bhai ya behen karta hai.`;
  }
  return prompt;
}

// --- AUDIO HELPERS ---
export function encodeAudio(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeAudio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function getApiKey(): string {
  return (
    (process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY || (import.meta as any).env?.API_KEY) || ''
  );
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  return new GoogleGenAI({ apiKey });
}
