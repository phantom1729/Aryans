import React from 'react';
import { Persona, MoodType, MoodEntry } from '../types';
import {
  Smile,
  Frown,
  Flame,
  Zap,
  Coffee,
  AlertCircle,
  X,
  Sparkles,
  HeartHandshake,
  ArrowRight,
  TrendingUp,
  Clock,
} from 'lucide-react';

interface MoodDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  persona: Persona;
  currentMood: MoodType;
  onSelectMood: (mood: MoodType) => void;
  onTalkAboutMood: (moodPrompt: string) => void;
  moodHistory: MoodEntry[];
}

const MOOD_CONFIG: Record<
  MoodType,
  {
    label: string;
    emoji: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgLight: string;
    border: string;
    bhaiAdvice: string;
    didiAdvice: string;
    defaultPrompt: string;
  }
> = {
  chill: {
    label: 'Chill & Relaxed',
    emoji: '😎',
    icon: Coffee,
    color: 'text-sky-600',
    bgLight: 'bg-sky-50 hover:bg-sky-100/80',
    border: 'border-sky-300',
    bhaiAdvice:
      'Chill reh mere bhai! Ek chai pi, gaane sun aur tension ko goli maar. Sab sort hai!',
    didiAdvice:
      'Khush raho! Apne mann ko shaant rakhna sabse badi taqat hai. Kuch achha padh lo ya rest kar lo.',
    defaultPrompt:
      'Bhai/Didi, aaj mind ekdum chill hai, chalo kuch mast baat karte hain!',
  },
  happy: {
    label: 'Happy & Joyful',
    emoji: '🥳',
    icon: Smile,
    color: 'text-amber-600',
    bgLight: 'bg-amber-50 hover:bg-amber-100/80',
    border: 'border-amber-300',
    bhaiAdvice:
      'Are wah mere sher! Aaj itna khush kyun hai? Koyi party ka plan hai kya? Khul ke muskura!',
    didiAdvice:
      'Tumhari muskaan dekh kar mera dil khush ho gaya! Nazar na lage, hamesha aise hi muskuraate raho.',
    defaultPrompt:
      'Bhai/Didi, aaj main bohot khush hoon! Mere sath celebrate karo!',
  },
  stressed: {
    label: 'Stressed & Anxious',
    emoji: '😰',
    icon: AlertCircle,
    color: 'text-orange-600',
    bgLight: 'bg-orange-50 hover:bg-orange-100/80',
    border: 'border-orange-300',
    bhaiAdvice:
      'Oye, itna overthink mat kar! Saans le lambi. Jo hoga tera bhai dekh lega, tu bas step by step chal.',
    didiAdvice:
      'Ghabrao mat, thoda paani piyo. Har mushkil ka hal nikalta hai. Mujhse batao kya baat pareshan kar rahi hai.',
    defaultPrompt:
      'Bhai/Didi, aaj bohot stress ho raha hai, samajh nahi aa raha kya karun... help karo na.',
  },
  sad: {
    label: 'Sad & Low',
    emoji: '🥺',
    icon: Frown,
    color: 'text-rose-600',
    bgLight: 'bg-rose-50 hover:bg-rose-100/80',
    border: 'border-rose-300',
    bhaiAdvice:
      'Arre yaar udas mat ho! Main baitha hoon na tere sath. Kisne rulaya bata, abhi theek karta hoon.',
    didiAdvice:
      'Mera bachha... dil halka kar lo. Rona aaye toh ro lo, main yahin hoon tumhare sath. Didi sab theek kar degi.',
    defaultPrompt:
      'Bhai/Didi, aaj mann bohot bhari hai aur udasi lag rahi hai... bas aapse baat karni thi.',
  },
  motivated: {
    label: 'Motivated & Charged',
    emoji: '🚀',
    icon: Zap,
    color: 'text-indigo-600',
    bgLight: 'bg-indigo-50 hover:bg-indigo-100/80',
    border: 'border-indigo-300',
    bhaiAdvice:
      'Bas yahi aag chahiye! Uth aur macha de aaj. Tera koi competition nahi hai bro!',
    didiAdvice:
      'Shabash! Apne lakshya par focus rakho. Tumhare andar bohot potential hai, aage badho!',
    defaultPrompt:
      'Bhai/Didi, aaj full motivation hai kuch bada karne ka! Thoda guide karo na!',
  },
  angry: {
    label: 'Angry & Frustrated',
    emoji: '😤',
    icon: Flame,
    color: 'text-red-600',
    bgLight: 'bg-red-50 hover:bg-red-100/80',
    border: 'border-red-300',
    bhaiAdvice:
      'Thanda paani pi le pehle! Gusse mein galat decision mat le. Baad mein baat karenge jab dimag cool hoga.',
    didiAdvice:
      'Gusse ko apne upar haavi mat hone do. Gehari saans lo aur batao kyu itna gussa aa raha hai.',
    defaultPrompt:
      'Bhai/Didi, mujhe bohot gussa aur frustration aa raha hai kisi baat pe, kya karun?',
  },
};

export const MoodDashboard: React.FC<MoodDashboardProps> = ({
  isOpen,
  onClose,
  persona,
  currentMood,
  onSelectMood,
  onTalkAboutMood,
  moodHistory,
}) => {
  if (!isOpen) return null;

  const currentConfig = MOOD_CONFIG[currentMood] || MOOD_CONFIG.chill;
  const isBhai = persona === 'bhai';

  return (
    <div
      id="mood-dashboard-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
    >
      <div
        id="mood-dashboard-card"
        className="relative w-full max-w-2xl bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div
          className={`px-6 py-5 flex items-center justify-between border-b ${
            isBhai
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white'
              : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shadow-inner">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                Mood & Emotional Vibe
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 font-bold uppercase tracking-wider">
                  Live
                </span>
              </h2>
              <p className="text-xs text-white/80 font-medium">
                Apna current mood choose karo taaki {isBhai ? 'Bhai' : 'Didi'} dil se respond kar sakein
              </p>
            </div>
          </div>
          <button
            id="close-mood-modal"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-all active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {/* Mood Selector Grid */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 block">
              Aapka Abhi Ka Mood Kaisa Hai?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {(Object.keys(MOOD_CONFIG) as MoodType[]).map((m) => {
                const config = MOOD_CONFIG[m];
                const isSelected = currentMood === m;
                const Icon = config.icon;

                return (
                  <button
                    key={m}
                    id={`mood-btn-${m}`}
                    onClick={() => onSelectMood(m)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all duration-200 ${
                      isSelected
                        ? `${isBhai ? 'border-indigo-600 bg-indigo-50/80 shadow-md ring-2 ring-indigo-500/20' : 'border-rose-500 bg-rose-50/80 shadow-md ring-2 ring-rose-500/20'}`
                        : `${config.bgLight} border-slate-200/70 hover:border-slate-300`
                    }`}
                  >
                    <span className="text-2xl flex-shrink-0">{config.emoji}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                        <p
                          className={`text-xs sm:text-sm font-bold truncate ${
                            isSelected
                              ? isBhai
                                ? 'text-indigo-900'
                                : 'text-rose-900'
                              : 'text-slate-700'
                          }`}
                        >
                          {config.label}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current Advice Box */}
          <div
            className={`p-5 rounded-3xl border transition-all ${
              isBhai
                ? 'bg-gradient-to-br from-indigo-50/80 to-blue-50/50 border-indigo-200/80'
                : 'bg-gradient-to-br from-rose-50/80 to-pink-50/50 border-rose-200/80'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HeartHandshake
                  className={`w-5 h-5 ${isBhai ? 'text-indigo-600' : 'text-rose-500'}`}
                />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  {isBhai ? 'Bhai Ka Advice' : 'Didi Ka Advice'}
                </h3>
              </div>
              <span className="text-xl">{currentConfig.emoji}</span>
            </div>
            <p className="text-slate-700 text-sm sm:text-base font-medium leading-relaxed italic">
              "{isBhai ? currentConfig.bhaiAdvice : currentConfig.didiAdvice}"
            </p>

            <div className="mt-4 pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Is mood par direct baat karni hai?
              </span>
              <button
                id="talk-mood-btn"
                onClick={() => {
                  const prompt = currentConfig.defaultPrompt.replace(
                    'Bhai/Didi',
                    isBhai ? 'Bhai' : 'Didi'
                  );
                  onTalkAboutMood(prompt);
                  onClose();
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 ${
                  isBhai ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                <span>{isBhai ? 'Bhai Se Baat Karein' : 'Didi Se Baat Karein'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Mood Tracking History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                Recent Mood Logs
              </h4>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Streak Active
              </span>
            </div>

            {moodHistory.length > 0 ? (
              <div className="space-y-2">
                {moodHistory.slice(-4).reverse().map((entry) => {
                  const itemConfig = MOOD_CONFIG[entry.mood] || MOOD_CONFIG.chill;
                  const dateStr = new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{itemConfig.emoji}</span>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            {itemConfig.label}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {entry.note || 'Quick Check-in'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-400 font-medium">
                  Abhi tak koyi mood log nahi hua. Upar koyi mood select karein!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Emotional state auto-adapts with {isBhai ? 'Bhai' : 'Didi'}</span>
          <button
            onClick={onClose}
            className="font-bold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-200/50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
