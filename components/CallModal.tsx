import React from 'react';
import { Persona } from '../types';
import { Mic, MicOff, PhoneOff, ShieldCheck } from 'lucide-react';

interface CallModalProps {
  isOpen: boolean;
  persona: Persona;
  isSpeaking: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndCall: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  isOpen,
  persona,
  isSpeaking,
  isMuted,
  onToggleMute,
  onEndCall,
}) => {
  if (!isOpen) return null;

  const isBhai = persona === 'bhai';

  return (
    <div
      id="call-modal-view"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-12 text-white animate-in fade-in zoom-in duration-300 ${
        isBhai ? 'bg-[#090d1a]' : 'bg-[#180a14]'
      }`}
    >
      {/* Background Animated Rings */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div
          className={`w-[32rem] h-[32rem] rounded-full blur-3xl opacity-25 transition-all duration-700 ${
            isSpeaking
              ? isBhai
                ? 'bg-indigo-500 scale-125'
                : 'bg-rose-500 scale-125'
              : isBhai
              ? 'bg-blue-900 scale-100'
              : 'bg-pink-900 scale-100'
          }`}
        />
      </div>

      {/* Top Header */}
      <div className="relative z-10 flex flex-col items-center text-center mt-4 sm:mt-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold uppercase tracking-widest text-slate-200 mb-4 shadow-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              isSpeaking
                ? 'bg-emerald-400 animate-ping'
                : isMuted
                ? 'bg-red-400'
                : 'bg-emerald-400'
            }`}
          />
          <span>{isSpeaking ? 'Speaking' : isMuted ? 'Mic Muted' : 'Listening'}</span>
          <span className="text-white/30">•</span>
          <span>Ultra-Low Latency Live</span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight flex items-center gap-3">
          {isBhai ? 'Bhai AI' : 'Didi AI'}
          <span
            className={`text-sm sm:text-base font-bold px-3 py-1 rounded-xl text-white shadow-lg ${
              isBhai ? 'bg-indigo-600' : 'bg-rose-500'
            }`}
          >
            Voice: {isBhai ? 'Puck' : 'Kore'}
          </span>
        </h2>
        <p className="text-white/50 text-xs sm:text-sm font-semibold mt-2 max-w-md">
          {isBhai
            ? 'Tera bhai seedha dil se sun raha hai... khul ke bol!'
            : 'Tumhari didi sun rahi hain... jo mann mein hai bina jhijhak bolo.'}
        </p>
      </div>

      {/* Center Interactive Avatar & Waveform */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto">
        {/* Pulsing Avatar */}
        <div className="relative">
          {isSpeaking && (
            <>
              <div
                className={`absolute -inset-4 sm:-inset-6 rounded-[3.5rem] opacity-40 blur-xl animate-pulse ${
                  isBhai ? 'bg-indigo-500' : 'bg-rose-500'
                }`}
              />
              <div
                className={`absolute -inset-8 sm:-inset-10 rounded-[4rem] opacity-20 blur-2xl animate-ping ${
                  isBhai ? 'bg-indigo-400' : 'bg-rose-400'
                }`}
              />
            </>
          )}

          <div
            className={`relative w-28 h-28 sm:w-40 sm:h-40 rounded-[2.5rem] sm:rounded-[3rem] flex items-center justify-center text-6xl sm:text-7xl shadow-2xl transition-all duration-300 ${
              isBhai
                ? 'bg-gradient-to-br from-indigo-600 to-blue-700 shadow-indigo-600/50'
                : 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/50'
            } ${isSpeaking ? 'scale-105' : 'scale-100'}`}
          >
            <span>{isBhai ? '🛡️' : '💖'}</span>
          </div>
        </div>

        {/* Audio Visualizer Wave */}
        <div className="mt-8 flex items-center justify-center h-16 w-64 gap-1.5 sm:gap-2">
          {isSpeaking ? (
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div
                key={i}
                className={`w-1.5 sm:w-2 rounded-full animate-wave ${
                  isBhai ? 'bg-indigo-400' : 'bg-rose-400'
                }`}
                style={{
                  height: `${25 + (Math.sin(i * 0.8) * 35 + 35)}%`,
                  animationDelay: `${i * 65}ms`,
                }}
              />
            ))
          ) : isMuted ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300 text-xs font-bold">
              <MicOff className="w-4 h-4 text-red-400" />
              <span>Mic Muted (Awaz nahi ja rahi)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-white/40 text-xs font-black uppercase tracking-widest">
              <div
                className={`w-2.5 h-2.5 rounded-full animate-ping ${
                  isBhai ? 'bg-indigo-400' : 'bg-rose-400'
                }`}
              />
              <span>Listening to your voice...</span>
            </div>
          )}
        </div>

        {/* Mute status banner */}
        <div className="mt-2 text-center">
          {isMuted ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-red-300 font-bold px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 animate-pulse">
              <MicOff className="w-3.5 h-3.5" />
              User awaz band hai - AI ko kuch sunai nahi de raha
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 font-medium px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Live & Secure Sibling Voice Session
            </span>
          )}
        </div>
      </div>

      {/* Bottom Controls (MUTE BUTTON & END CALL) */}
      <div className="relative z-10 flex flex-col items-center gap-4 mb-2 sm:mb-6">
        <div className="flex items-center gap-5 sm:gap-8">
          {/* MUTE / UNMUTE BUTTON */}
          <button
            id="call-mute-toggle-btn"
            onClick={onToggleMute}
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center shadow-xl transition-all duration-200 active:scale-95 border-2 ${
              isMuted
                ? 'bg-red-500/90 text-white border-red-400 ring-4 ring-red-500/30 scale-105'
                : 'bg-white/15 hover:bg-white/25 text-white border-white/20'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6 sm:w-8 sm:h-8" />
            ) : (
              <Mic className="w-6 h-6 sm:w-8 sm:h-8" />
            )}
            <span className="text-[9px] font-black uppercase mt-1 tracking-tight">
              {isMuted ? 'Unmute' : 'Mute'}
            </span>
          </button>

          {/* END CALL BUTTON */}
          <button
            id="call-end-btn"
            onClick={onEndCall}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center shadow-2xl active:scale-95 transition-all border-2 border-red-400 hover:brightness-110"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6 sm:w-8 sm:h-8" />
            <span className="text-[9px] font-black uppercase mt-1 tracking-tight">End</span>
          </button>
        </div>

        <p className="text-white/40 text-[11px] font-semibold text-center">
          Tap <strong className="text-white/70">Mute</strong> to talk privately without sending voice to {isBhai ? 'Bhai' : 'Didi'}
        </p>
      </div>

      {/* Wave animation style */}
      <style>{`
        @keyframes wave {
          0%, 100% {
            transform: scaleY(0.35);
            opacity: 0.4;
          }
          50% {
            transform: scaleY(1.3);
            opacity: 1;
          }
        }
        .animate-wave {
          animation: wave 0.8s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
    </div>
  );
};
