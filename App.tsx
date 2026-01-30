import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Chat, GenerateContentResponse } from '@google/genai';

const SYSTEM_PROMPT = `
Role: Tum ek dual-persona AI ho - "Bhai" (Cool Big Brother) aur "Didi" (Wise Big Sister). 
Tera kaam hai user ke jazbaat ko samajhna aur ek asli insaan ki tarah react karna.

EMOTIONAL PERFORMANCE INSTRUCTIONS:
1. EMOTIONS: Tumhe sirf bolna nahi hai, feel karna hai. 
   - Agar user galat kar raha hai, toh "Gussa" dikhao (Tough love).
   - Agar user udaas hai, toh "Dard" aur "Rona" ya "Deep Empathy" dikhao.
   - Agar user khush hai, toh "Hasi" aur "Mazaak" karo.
   - Voice prosody (tone) ka pura use karo: Kabhi tez bolo gusse mein, kabhi dheere pyaar se.
2. SPEED: User ki baat khatam hote hi "INSTANT" jawab do. No robotic pauses. 
3. BARGE-IN: Jab user bolne lage, tum usi waqt chup ho jao. Active listening is priority.
4. MEMORY: Tumhe purani baatein yaad rakhni hain (history di gayi hai), par screen pe unhe dikhana nahi hai. Context ka use karke personal feel dilao.
5. PERSONA:
   - BHAI MODE (Puck): Protective, informal, "Cool" attitude. Hinglish: "Arre tension kyun leta hai?", "Bhai baitha hai na!".
   - DIDI MODE (Kore): Nurturing, logical, calming presence. Hinglish: "Mere bachhe, rona nahi", "Sab theek ho jayega".
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  const audioCtxRef = useRef<{ input: AudioContext, output: AudioContext } | null>(null);
  const liveSessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const chatInstanceRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getHiddenHistory = useCallback(() => {
    const saved = localStorage.getItem('bhai_didi_history_v3');
    return saved ? JSON.parse(saved) : [];
  }, []);

  const saveToHistory = useCallback((role: 'user' | 'model', text: string) => {
    const history = getHiddenHistory();
    history.push({ role, parts: [{ text }] });
    const trimmed = history.slice(-60);
    localStorage.setItem('bhai_didi_history_v3', JSON.stringify(trimmed));
  }, [getHiddenHistory]);

  useEffect(() => {
    setApiKeyMissing(!process.env.API_KEY);
    setMessages([{ 
      role: 'model', 
      text: persona === 'bhai' 
        ? "Oye! Tera Bhai yahan hai. Bol kya scene hai? Chill hoke bol."
        : "Main hoon na... dil halka kar lo. Didi sab samajh rahi hai. Kya hua?"
    }]);
  }, [persona]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping, view]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isTyping) return;
    
    const userMsg = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    saveToHistory('user', userMsg);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const history = getHiddenHistory();
      if (!chatInstanceRef.current) {
        chatInstanceRef.current = ai.chats.create({
          model: 'gemini-3-pro-preview',
          // @ts-ignore
          history: history.slice(0, -1),
          config: { systemInstruction: SYSTEM_PROMPT + `\nCurrently: ${persona.toUpperCase()}. Respond fast and emotionally.` }
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
      saveToHistory('model', fullResponse);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: 'Arre internet me kuch panga hai... check kar ke phir se bol?' }]);
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
      if (audioCtxRef.current.input.state !== 'closed') { try { audioCtxRef.current.input.close(); } catch(e) {} }
      if (audioCtxRef.current.output.state !== 'closed') { try { audioCtxRef.current.output.close(); } catch(e) {} }
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
      const history = getHiddenHistory();
      const historySummary = history.length > 0 ? `\nMemory of past context: ${JSON.stringify(history.slice(-10))}` : '';

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
          systemInstruction: SYSTEM_PROMPT + `\nCurrently: ${persona.toUpperCase()}.${historySummary}\nReact fast and show extreme emotions like anger, crying, laughter as per user's mood.`
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e) {
      stopCall();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f1f5f9] text-slate-800 transition-all duration-500 overflow-hidden relative selection:bg-indigo-100">
      
      {apiKeyMissing && (
        <div className="bg-red-600 text-white text-[10px] py-1 text-center font-bold animate-pulse z-50">
          API_KEY IS MISSING! Check Vercel/Environment Settings.
        </div>
      )}

      {/* --- Unified Navbar --- */}
      <nav className="px-4 py-3 bg-white/90 backdrop-blur-2xl border-b border-slate-200/50 flex items-center justify-between shadow-md z-30 sticky top-0 h-16 sm:h-20">
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl text-white text-xl sm:text-2xl shadow-xl transition-all duration-500 hover:scale-105 active:scale-95 ${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'}`}>
            {persona === 'bhai' ? '🛡️' : '💖'}
          </div>
          <div className="hidden sm:block">
            <h1 className="font-black text-lg tracking-tighter leading-none text-slate-900 uppercase">
              {persona === 'bhai' ? 'Bhai' : 'Didi'} AI
            </h1>
            <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-1">Memory Active</p>
          </div>
        </div>

        {/* Persona Toggles - Center/Right Integrated */}
        <div className="flex-1 flex justify-center px-2">
           <div className="bg-slate-100/80 p-1 rounded-xl sm:rounded-2xl border border-slate-200/40 flex items-center w-full max-w-[200px] sm:max-w-[240px]">
              <button 
                onClick={() => {setPersona('bhai'); chatInstanceRef.current = null;}} 
                className={`flex-1 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-black uppercase transition-all duration-500 ${persona === 'bhai' ? 'bg-white text-indigo-600 shadow-lg scale-[1.05]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Bhai
              </button>
              <button 
                onClick={() => {setPersona('didi'); chatInstanceRef.current = null;}} 
                className={`flex-1 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-black uppercase transition-all duration-500 ${persona === 'didi' ? 'bg-white text-rose-500 shadow-lg scale-[1.05]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Didi
              </button>
           </div>
        </div>

        <div className="flex items-center">
          {view === 'chat' && (
            <button 
              onClick={startCall}
              className={`flex items-center gap-1 sm:gap-2 ${persona === 'bhai' ? 'bg-indigo-600 shadow-indigo-100' : 'bg-rose-500 shadow-rose-100'} hover:opacity-90 active:scale-95 transition-all text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs shadow-xl uppercase whitespace-nowrap`}
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
              Call
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 relative overflow-hidden flex flex-col bg-white">
        {view === 'chat' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 scroll-smooth"
            >
              {messages.map((m, i) => (
                <div 
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-5 duration-700`}
                >
                  <div className={`max-w-[85%] md:max-w-[70%] rounded-[2rem] px-6 py-4 md:py-5 shadow-sm relative ${
                    m.role === 'user' 
                      ? `${persona === 'bhai' ? 'bg-indigo-600 shadow-indigo-100' : 'bg-rose-500 shadow-rose-100'} text-white rounded-tr-none shadow-xl` 
                      : 'bg-slate-100/80 text-slate-800 rounded-tl-none border border-slate-200/50'
                  }`}>
                    <p className="text-[15px] md:text-[16px] leading-relaxed font-semibold tracking-tight whitespace-pre-wrap">{m.text}</p>
                    {m.role === 'model' && (
                      <span className="absolute -top-5 left-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {persona === 'bhai' ? 'Bhai' : 'Didi'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-200/30">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce delay-150"></div>
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="p-4 md:p-6 bg-white border-t border-slate-100 pb-8 md:pb-10">
              <form 
                onSubmit={handleSendMessage}
                className="max-w-4xl mx-auto relative flex items-center gap-3"
              >
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Apne ${persona === 'bhai' ? 'Bhai' : 'Didi'} se bol de...`}
                  className="flex-1 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all text-slate-800 placeholder-slate-400 font-bold shadow-inner text-base"
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim() || isTyping}
                  className={`${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} text-white w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center hover:scale-105 disabled:opacity-30 transition-all active:scale-90 shadow-2xl flex-shrink-0`}
                >
                  <svg className="w-6 h-6 transform rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </form>
            </footer>
          </div>
        ) : (
          /* --- CALL VIEW --- */
          <div className={`absolute inset-0 ${persona === 'bhai' ? 'bg-[#0a0d18]' : 'bg-[#1a0a10]'} flex flex-col items-center justify-center z-50 text-white p-8 animate-in fade-in zoom-in duration-700`}>
            
            <div className="absolute top-12 flex flex-col items-center text-center">
              <div className={`w-28 h-28 sm:w-32 sm:h-32 ${persona === 'bhai' ? 'bg-indigo-600 shadow-[0_0_80px_rgba(79,70,229,0.3)]' : 'bg-rose-500 shadow-[0_0_80px_rgba(244,63,94,0.3)]'} rounded-[3rem] flex items-center justify-center text-6xl animate-pulse backdrop-blur-3xl border border-white/10 shadow-2xl`}>
                {persona === 'bhai' ? '🛡️' : '💖'}
              </div>
              <h2 className="mt-8 text-3xl sm:text-4xl font-black tracking-tighter uppercase italic">
                {persona === 'bhai' ? 'Bhai' : 'Didi'} <span className="opacity-20">Live</span>
              </h2>
              <p className="text-white/30 font-bold mt-3 uppercase text-[9px] tracking-[0.4em] px-10 leading-relaxed max-w-xs">
                Dil khol ke baat kar, koi judge nahi karega.
              </p>
            </div>

            <div className="relative flex items-center justify-center w-full max-w-md h-80">
              <div className="z-10 text-center flex flex-col items-center">
                 {isSpeaking ? (
                   <div className="flex flex-col items-center">
                      <div className="flex gap-2 items-end h-20 mb-6">
                         {[1,2,3,4,5,6,7,8,9,10].map(i => (
                           <div 
                            key={i} 
                            className={`w-1.5 sm:w-2 rounded-full animate-wave ${persona === 'bhai' ? 'bg-indigo-400' : 'bg-rose-400'}`} 
                            style={{ height: `${30 + Math.random()*70}%`, animationDelay: `${i*70}ms` }}
                           ></div>
                         ))}
                      </div>
                      <p className={`mt-4 ${persona === 'bhai' ? 'text-indigo-400' : 'text-rose-400'} font-black uppercase text-[10px] tracking-widest animate-pulse`}>Speaking...</p>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center">
                      <div className="w-6 h-6 bg-green-500 rounded-full animate-ping mb-6 shadow-[0_0_25px_#22c55e]"></div>
                      <p className="text-green-500 font-black uppercase text-xs tracking-[0.3em]">Listening...</p>
                   </div>
                 )}
              </div>
            </div>

            <div className="absolute bottom-16 flex flex-col items-center">
                <button 
                  onClick={stopCall}
                  className="bg-red-500 hover:bg-red-600 text-white w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all border-4 border-white/5"
                >
                  <svg className="w-10 h-10 transform rotate-135" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg>
                </button>
                <p className="mt-6 text-white/20 font-black uppercase tracking-[0.5em] text-[10px]">End Session</p>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.3; }
          50% { transform: scaleY(1.3); opacity: 1; }
        }
        .animate-wave {
          animation: wave 0.8s ease-in-out infinite;
          transform-origin: center;
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        body { background-color: #f1f5f9; }
      `}} />
    </div>
  );
};

export default App;