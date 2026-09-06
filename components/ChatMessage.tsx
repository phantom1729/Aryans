import React, { useState } from 'react';
import { Message, Persona } from '../types';
import { Copy, Check, Sparkles } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  persona: Persona;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, persona }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isBhai = persona === 'bhai';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`group flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300 relative`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-[1.5rem] sm:rounded-[2rem] px-5 py-3.5 sm:px-7 sm:py-5 relative shadow-sm transition-all ${
          isUser
            ? `${
                isBhai
                  ? 'bg-gradient-to-br from-indigo-600 to-blue-700 text-white shadow-indigo-200'
                  : 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-rose-200'
              } rounded-tr-none`
            : 'bg-white/95 backdrop-blur-md text-slate-800 rounded-tl-none border border-slate-200/80 shadow-slate-100'
        }`}
      >
        {/* Model Persona Tag */}
        {!isUser && (
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span
              className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1 ${
                isBhai ? 'text-indigo-600' : 'text-rose-500'
              }`}
            >
              <span>{isBhai ? '🛡️ Bhai' : '💖 Didi'}</span>
              <Sparkles className="w-2.5 h-2.5 inline" />
            </span>

            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
              title="Copy message"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        )}

        <p className="text-[15px] sm:text-[16px] leading-relaxed font-medium whitespace-pre-wrap selection:bg-indigo-200 selection:text-slate-900">
          {message.text}
        </p>

        {/* Timestamp */}
        {message.timestamp && (
          <span
            className={`text-[9px] font-semibold mt-1.5 block text-right ${
              isUser ? 'text-white/70' : 'text-slate-400'
            }`}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
    </div>
  );
};
