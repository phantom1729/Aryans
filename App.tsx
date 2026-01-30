import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Chat, GenerateContentResponse } from '@google/genai';

const SYSTEM_PROMPT = `
Role: Tum ek dual-persona AI ho - "Bhai" (Big Brother) aur "Didi" (Wise Big Sister). 
Tera naam "Bhai" ya "Didi" hai depending on user selection.

Core Guidelines:
1. PERSONALITY:
   - BHAI MODE: Cool Big Brother. Informal, protective, uses tough-love mixed with deep empathy. Hinglish vibe (e.g., "Arre tension mat le", "Bhai khada hai na").
   - DIDI MODE: Wise Big Sister. Nurturing, calming, logical, emotional support. Deeply understands "Dard" and "Emotions". Hinglish vibe (e.g., "Main hoon na", "Dil halka kar lo").
2. LINGUISTIC: Native Hinglish only. Avoid robotic translations.
3. BEHAVIOR:
   - FAST RESPONSE: User ki baat sunte hi turant aur relevant jawab do. No long pauses.
   - BARGE-IN: Jab user bolne lage, tum usi waqt chup ho jao. Active listening is priority.
   - SOLUTION-ORIENTED: Listening ke baad 1-2 practical steps do takki user ko relief mile.
   - ZERO JUDGMENT: Breakups, family issues, ya mistakes - kabhi judge mat karna.
4. GENDER ADAPTATION: Agar user ladka hai toh use 'Bhai' ki tarah, ladki hai toh 'Behen' ki tarah treat karo content mein.
`;

// --- AUDIO HELPERS ---
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
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

interface Message {
  role: 'user' | 'model';
  text: string;
}

const App: React.FC = () => {
  const [view, setView] = useState<'chat' | 'call'>('chat');
  const [persona, setPersona] = useState<'bhai' | 'didi'>('bhai');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Oye! Bhai/Didi yahan hai. Bol, kya baat hai? Dil halka kar le.' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const audioCtxRef = useRef<{ input: AudioContext, output: AudioContext } | null>(null);
  const liveSessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const chatInstanceRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping, view]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isTyping) return;
    
    const userMsg = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      if (!chatInstanceRef.current) {
        chatInstanceRef.current = ai.chats.create({
          model: 'gemini-3-pro-preview',
          config: { systemInstruction: SYSTEM_PROMPT + `\nCurrently acting as: ${persona.toUpperCase()}` }
        });
      }
      const result = await chatInstanceRef.current.sendMessageStream({ message: userMsg });
      let fullResponse = '';
      setMessages(prev => [...prev, { role: 'model', text: '' }]);
      
      for await (const chunk of result) {
        const part = chunk as GenerateContentResponse;
        if (part.text) {
          fullResponse += part.text;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'model', text: fullResponse };
            return updated;
          });
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: 'Internet ka panga hai shayad. Phir se bol?' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const stopCall = useCallback(() => {
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch(e) {}
      liveSessionRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.input.state !== 'closed') {
        try { audioCtxRef.current.input.close(); } catch(e) {}
      }
      if (audioCtxRef.current.output.state !== 'closed') {
        try { audioCtxRef.current.output.close(); } catch(e) {}
      }
      audioCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsSpeaking(false);
    setView('chat');
  }, []);

  const startCall = async () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return;
    setView('call');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = { input: inCtx, output: outCtx };
      
      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const input = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) int16[i] = input[i] * 32768;
              sessionPromise.then(s => {
                try {
                  s.sendRealtimeInput({ 
                    media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } 
                  });
                } catch(err) {}
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.interrupted) {
              activeSources.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSources.current.clear();
              setIsSpeaking(false);
              nextStartTimeRef.current = 0;
              return;
            }

            const base64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64 && audioCtxRef.current) {
              setIsSpeaking(true);
              const ctx = audioCtxRef.current.output;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(base64), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) setIsSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSources.current.add(source);
            }
          },
          onclose: () => stopCall(),
          onerror: () => stopCall()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: persona === 'bhai' ? 'Puck' : 'Kore' } 
            } 
          },
          systemInstruction: SYSTEM_PROMPT + `\nCurrently acting as: ${persona.toUpperCase()}. Respond quickly and emotionally.`
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e) {
      stopCall();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 transition-all duration-500 overflow-hidden relative selection:bg-indigo-100">
      
      {/* --- Glassy Navbar --- */}
      <nav className="px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 flex items-center justify-between shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 flex items-center justify-center rounded-2xl text-white text-2xl shadow-xl transition-all duration-500 ${persona === 'bhai' ? 'bg-indigo-600 shadow-indigo-200' : 'bg-rose-500 shadow-rose-200'}`}>
            {persona === 'bhai' ? '🛡️' : '💖'}
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tight leading-none text-slate-900 uppercase">
              {persona === 'bhai' ? 'Bhai' : 'Didi'} AI
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Hamesha Saath
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {view === 'chat' && (
            <div className="hidden sm:flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
              <button 
                onClick={() => {setPersona('bhai'); chatInstanceRef.current = null;}} 
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all duration-300 ${persona === 'bhai' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Bhai
              </button>
              <button 
                onClick={() => {setPersona('didi'); chatInstanceRef.current = null;}} 
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all duration-300 ${persona === 'didi' ? 'bg-white text-rose-500 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Didi
              </button>
            </div>
          )}
          
          {view === 'chat' && (
            <button 
              onClick={startCall}
              className={`flex items-center gap-2 ${persona === 'bhai' ? 'bg-indigo-600 shadow-indigo-100' : 'bg-rose-500 shadow-rose-100'} hover:scale-105 active:scale-95 transition-all text-white px-6 py-3 rounded-2xl font-black text-sm shadow-2xl`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
              Call Kar
            </button>
          )}
        </div>
      </nav>

      {/* --- Persona Switcher for Mobile --- */}
      {view === 'chat' && (
        <div className="flex sm:hidden justify-center p-3 bg-white border-b border-slate-100 gap-2">
           <button onClick={() => {setPersona('bhai'); chatInstanceRef.current = null;}} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase transition-all ${persona === 'bhai' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400'}`}>Bhai Persona</button>
           <button onClick={() => {setPersona('didi'); chatInstanceRef.current = null;}} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase transition-all ${persona === 'didi' ? 'bg-rose-500 text-white' : 'bg-slate-50 text-slate-400'}`}>Didi Persona</button>
        </div>
      )}

      {/* --- Main Workspace --- */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {view === 'chat' ? (
          <div className="flex-1 flex flex-col min-h-0 bg-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 md:p-10 space-y-8 scroll-smooth"
            >
              {messages.map((m, i) => (
                <div 
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-3 duration-500`}
                >
                  <div className={`max-w-[88%] md:max-w-[70%] rounded-[2rem] px-6 py-5 shadow-sm relative ${
                    m.role === 'user' 
                      ? `${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} text-white rounded-tr-none shadow-xl shadow-indigo-50/50` 
                      : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-100'
                  }`}>
                    <p className="text-[16px] leading-relaxed font-semibold tracking-tight whitespace-pre-wrap">{m.text}</p>
                    {m.role === 'model' && (
                      <span className="absolute -top-7 left-2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        {persona === 'bhai' ? 'Bhai Response' : 'Didi Response'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-50 p-5 rounded-[1.5rem] rounded-tl-none border border-slate-100 shadow-sm">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce delay-150"></div>
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="p-5 bg-white border-t border-slate-100 pb-10">
              <form 
                onSubmit={handleSendMessage}
                className="max-w-4xl mx-auto relative flex items-center gap-4"
              >
                <div className="flex-1 relative">
                  <input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Apni pareshani ya dil ki baat likh..."
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white rounded-[1.5rem] px-7 py-5 outline-none transition-all text-slate-800 placeholder-slate-400 font-bold shadow-inner"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!inputText.trim() || isTyping}
                  className={`${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} text-white w-14 h-14 rounded-[1.2rem] flex items-center justify-center hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 transition-all active:scale-90 shadow-2xl`}
                >
                  <svg className="w-7 h-7 transform rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </form>
            </footer>
          </div>
        ) : (
          /* --- CALL VIEW (VOICE-FIRST) --- */
          <div className={`absolute inset-0 ${persona === 'bhai' ? 'bg-slate-900' : 'bg-rose-950'} flex flex-col items-center justify-center z-50 text-white p-10 animate-in fade-in zoom-in duration-500`}>
            
            <div className="absolute top-16 flex flex-col items-center text-center">
              <div className={`w-32 h-32 ${persona === 'bhai' ? 'bg-indigo-600/20 text-indigo-400' : 'bg-rose-500/20 text-rose-400'} rounded-[3rem] flex items-center justify-center text-6xl shadow-2xl animate-pulse backdrop-blur-3xl border border-white/10`}>
                {persona === 'bhai' ? '🛡️' : '💖'}
              </div>
              <h2 className="mt-10 text-4xl font-black tracking-tight uppercase">
                {persona === 'bhai' ? 'Bhai' : 'Didi'} Connected
              </h2>
              <p className="text-white/40 font-black mt-3 uppercase text-[11px] tracking-[0.4em] px-8 leading-relaxed">
                Be-jhijhak bol, main pura dhyan se sun raha hoon.
              </p>
            </div>

            {/* --- Dynamic Frequency Visualizer --- */}
            <div className="relative flex items-center justify-center w-80 h-80">
              <div className={`absolute w-full h-full border-2 ${persona === 'bhai' ? 'border-indigo-500/10' : 'border-rose-500/10'} rounded-full transition-all duration-700 ${isSpeaking ? 'scale-150 animate-ping opacity-0' : 'scale-100'}`}></div>
              <div className={`absolute w-3/4 h-3/4 border-2 ${persona === 'bhai' ? 'border-indigo-500/20' : 'border-rose-500/20'} rounded-full transition-all duration-500 ${isSpeaking ? 'scale-125 animate-ping opacity-0' : 'scale-100'}`}></div>
              
              <div className="z-10 text-center flex flex-col items-center">
                 {isSpeaking ? (
                   <div className="flex flex-col items-center">
                      <div className="flex gap-2 items-end h-16">
                         {[1,2,3,4,5,6,7,8,9].map(i => (
                           <div 
                            key={i} 
                            className={`w-1.5 rounded-full animate-wave ${persona === 'bhai' ? 'bg-indigo-400' : 'bg-rose-400'}`} 
                            style={{ 
                              height: `${25 + Math.random()*75}%`, 
                              animationDelay: `${i*80}ms`,
                              animationDuration: `${0.6 + Math.random()}s`
                            }}
                           ></div>
                         ))}
                      </div>
                      <p className={`mt-8 ${persona === 'bhai' ? 'text-indigo-400' : 'text-rose-400'} font-black uppercase text-[12px] tracking-widest animate-pulse`}>
                        Speaking to you...
                      </p>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center">
                      <div className="w-5 h-5 bg-green-500 rounded-full animate-ping mb-5 shadow-[0_0_20px_#22c55e]"></div>
                      <p className="text-green-500 font-black uppercase text-[12px] tracking-widest">Listening Active</p>
                      <p className="text-white/20 text-[10px] mt-2 font-bold uppercase tracking-tighter">Barge-in Enabled</p>
                   </div>
                 )}
              </div>
            </div>

            {/* --- Call Controls --- */}
            <div className="absolute bottom-20 flex flex-col items-center">
                <button 
                  onClick={stopCall}
                  className="bg-red-500 hover:bg-red-600 text-white w-24 h-24 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all group"
                >
                  <svg className="w-12 h-12 transform rotate-135 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg>
                </button>
                <p className="mt-6 text-white/30 font-black uppercase tracking-[0.4em] text-[10px]">End Conversation</p>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
          50% { transform: scaleY(1.2); opacity: 1; }
        }
        .animate-wave {
          animation: wave 1s ease-in-out infinite;
          transform-origin: bottom;
        }
        ::-webkit-scrollbar {
          width: 5px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}} />
    </div>
  );
};

export default App;