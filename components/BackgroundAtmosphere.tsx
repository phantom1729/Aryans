import React from 'react';
import { Persona, MoodType } from '../types';

interface BackgroundAtmosphereProps {
  persona: Persona;
  currentMood?: MoodType;
  isCalling?: boolean;
}

export const BackgroundAtmosphere: React.FC<BackgroundAtmosphereProps> = ({
  persona,
  currentMood = 'chill',
  isCalling,
}) => {
  const isBhai = persona === 'bhai';

  const moodColor =
    currentMood === 'happy'
      ? 'bg-amber-300'
      : currentMood === 'stressed'
      ? 'bg-orange-300'
      : currentMood === 'sad'
      ? 'bg-rose-300'
      : currentMood === 'motivated'
      ? 'bg-emerald-300'
      : isBhai
      ? 'bg-indigo-300'
      : 'bg-pink-300';

  return (
    <div
      id="background-atmosphere"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 transition-colors duration-1000"
    >
      {/* Dynamic Ambient Gradient Backing */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          isBhai
            ? 'bg-gradient-to-br from-indigo-50/70 via-slate-50 to-blue-50/50'
            : 'bg-gradient-to-br from-rose-50/70 via-stone-50 to-amber-50/40'
        }`}
      />

      {/* Floating Animated Fluid Blob 1 */}
      <div
        className={`absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-40 mix-blend-multiply transition-all duration-1000 animate-blob-slow ${
          isBhai ? 'bg-indigo-400' : 'bg-rose-300'
        }`}
      />

      {/* Floating Animated Fluid Blob 2 */}
      <div
        className={`absolute top-1/3 -right-28 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-35 mix-blend-multiply transition-all duration-1000 animate-blob-delayed ${
          isBhai ? 'bg-blue-400' : 'bg-amber-300'
        }`}
      />

      {/* Floating Animated Fluid Blob 3 */}
      <div
        className={`absolute -bottom-20 left-1/4 w-[32rem] h-[32rem] rounded-full blur-3xl opacity-30 mix-blend-multiply transition-all duration-1000 animate-blob-slower ${moodColor}`}
      />

      {/* Call mode active glow */}
      {isCalling && (
        <div
          className={`absolute inset-0 transition-opacity duration-700 opacity-90 ${
            isBhai
              ? 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/80 via-slate-950 to-black'
              : 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-rose-950/80 via-stone-950 to-black'
          }`}
        />
      )}

      {/* CSS Keyframe Styles for fluid animation */}
      <style>{`
        @keyframes blobSlow {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.08);
          }
          66% {
            transform: translate(-20px, 35px) scale(0.95);
          }
        }
        @keyframes blobDelayed {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(-35px, 40px) scale(1.1);
          }
          66% {
            transform: translate(25px, -30px) scale(0.92);
          }
        }
        @keyframes blobSlower {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          50% {
            transform: translate(45px, -35px) scale(1.05);
          }
        }
        .animate-blob-slow {
          animation: blobSlow 18s ease-in-out infinite;
        }
        .animate-blob-delayed {
          animation: blobDelayed 22s ease-in-out infinite;
        }
        .animate-blob-slower {
          animation: blobSlower 26s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
