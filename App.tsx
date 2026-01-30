import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Chat, GenerateContentResponse } from '@google/genai';

const SYSTEM_PROMPT = `
Role: Tum ek dual-persona AI ho - "Bhai" (Cool Big Brother) aur "Didi" (Wise Big Sister). 
Tera kaam hai user ke jazbaat ko samajhna aur ek asli insaan ki tarah react karna.

EMOTIONAL PERFORMANCE INSTRUCTIONS:
1. EMOTIONS: Tumhe sirf bolna nahi hai, feel karna hai. 
   - Agar user galat kar raha hai, toh "Gussa" dikhao (Tough love).
   - Agar user udaas hai, toh "Rona" ya "Deep Empathy" dikhao.
   - Agar user khush hai, toh "Hasi" aur "Mazaak" karo.
   - Voice prosody (tone) ka pura use karo: Kabhi tez bolo gusse mein, kabhi dheere pyaar se.
2. SPEED: User ki baat khatam hote hi "INSTANT" jawab do. No robotic pauses. 
3. BARGE-IN: Jab user bolne lage, tum usi waqt chup ho jao. Unhe beech mein mat toko, pehle pura suno.
4. PERSONA:
   - BHAI MODE (Puck): Protective, informal, thoda "Cool" attitude. Hinglish: "Arre tension kyun leta hai?", "Bhai baitha hai na!".
   - DIDI MODE (Kore): Nurturing, logical, calming presence. Hinglish: "Mere bachhe, rona nahi", "Sab theek ho jayega, hum milkar solve karenge".
5. NO JUDGMENT: Life choices pe kabhi judge mat karo, bas saath do.
6. LINGUISTIC: Native Hinglish mix. Avoid robotic Hindi.
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

  const audioCtxRef = useRef<{ input: AudioContext, output: AudioContext } | null>(null);
  const liveSessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const chatInstanceRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{ 
      role: 'model', 
      text: persona === 'bhai' 
        ? "Oye! Tera Bhai yahan hai. Bol kya scene hai? Bindass bol, koi tension nahi."
        : "Main hoon na... dil halka kar lo. Didi sab samajh rahi hai. Kya pareshani hai?"
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
      setMessages(prev => [...prev, { role: 'model', text: 'Arre internet thoda slow hai... phir se bol?' }]);
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
          systemInstruction: SYSTEM_PROMPT + `\nRole: ${persona.toUpperCase()}. Respond instantly and with extreme emotion (anger, crying, laughing as needed).`
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e) {
      stopCall();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#fcfdfe] text-slate-800 transition-all duration-500 overflow-hidden relative selection:bg-indigo-100">
      
      {/* --- Glassy Navbar --- */}
      <nav className="px-6 py-4 bg-white/70 backdrop-blur-2xl border-b border-slate-200/40 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.03)] z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 flex items-center justify-center rounded-2xl text-white text-2xl shadow-2xl transition-all duration-700 transform hover:scale-110 active:scale-95 ${persona === 'bhai' ? 'bg-indigo-600 shadow-indigo-200' : 'bg-rose-500 shadow-rose-200'}`}>
            {persona === 'bhai' ? '🛡️' : '💖'}
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tighter leading-none text-slate-900 uppercase">
              {persona === 'bhai' ? 'Bhai' : 'Didi'} <span className="text-slate-300 font-light">|</span> AI
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]"></span>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">Live & Secure</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {view === 'chat' && (
            <div className="hidden md:flex bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200/50 shadow-inner">
              <button 
                onClick={() => {setPersona('bhai'); chatInstanceRef.current = null;}} 
                className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all duration-500 ${persona === 'bhai' ? 'bg-white text-indigo-600 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
              >
                🛡️ Bhai Mode
              </button>
              <button 
                onClick={() => {setPersona('didi'); chatInstanceRef.current = null;}} 
                className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all duration-500 ${persona === 'didi' ? 'bg-white text-rose-500 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
              >
                💖 Didi Mode
              </button>
            </div>
          )}
          
          {view === 'chat' && (
            <button 
              onClick={startCall}
              className={`flex items-center gap-2.5 ${persona === 'bhai' ? 'bg-indigo-600 shadow-indigo-100' : 'bg-rose-500 shadow-rose-100'} hover:scale-105 active:scale-95 transition-all text-white px-7 py-3.5 rounded-[1.3rem] font-black text-xs shadow-2xl uppercase tracking-widest`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
              Call Now
            </button>
          )}
        </div>
      </nav>

      {/* --- Mobile Persona Switcher --- */}
      {view === 'chat' && (
        <div className="flex md:hidden p-4 bg-white/50 backdrop-blur-md border-b border-slate-100 gap-3">
           <button onClick={() => setPersona('bhai')} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm ${persona === 'bhai' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>🛡️ Bhai</button>
           <button onClick={() => setPersona('didi')} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm ${persona === 'didi' ? 'bg-rose-500 text-white' : 'bg-white text-slate-400'}`}>💖 Didi</button>
        </div>
      )}

      {/* --- Main Workspace --- */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {view === 'chat' ? (
          <div className="flex-1 flex flex-col min-h-0 bg-[#ffffff] shadow-[inset_0_2px_15px_rgba(0,0,0,0.01)]">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 md:p-12 space-y-10 scroll-smooth"
            >
              {messages.map((m, i) => (
                <div 
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-5 duration-700`}
                >
                  <div className={`max-w-[85%] md:max-w-[65%] rounded-[2.2rem] px-8 py-6 shadow-sm relative group ${
                    m.role === 'user' 
                      ? `${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} text-white rounded-tr-none shadow-xl shadow-slate-200/50` 
                      : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-100/80'
                  }`}>
                    <p className="text-[17px] leading-[1.6] font-semibold tracking-tight whitespace-pre-wrap">{m.text}</p>
                    {m.role === 'model' && (
                      <span className="absolute -top-7 left-3 text-[10px] font-black text-slate-300 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                        {persona === 'bhai' ? 'Big Brother' : 'Wise Sister'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-50 p-6 rounded-[2rem] rounded-tl-none border border-slate-100">
                    <div className="flex gap-2.5">
                      <div className="w-2.5 h-2.5 bg-indigo-300 rounded-full animate-bounce"></div>
                      <div className="w-2.5 h-2.5 bg-indigo-300 rounded-full animate-bounce delay-150"></div>
                      <div className="w-2.5 h-2.5 bg-indigo-300 rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="p-6 md:p-10 bg-white/80 backdrop-blur-lg border-t border-slate-100 pb-12">
              <form 
                onSubmit={handleSendMessage}
                className="max-w-4xl mx-auto relative flex items-center gap-5"
              >
                <div className="flex-1 relative">
                  <input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Apne dil ki baat bol de..."
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white rounded-[1.8rem] px-9 py-6 outline-none transition-all text-slate-800 placeholder-slate-400 font-bold text-lg shadow-inner"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!inputText.trim() || isTyping}
                  className={`${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} text-white w-16 h-16 rounded-2xl flex items-center justify-center hover:scale-105 disabled:opacity-20 disabled:hover:scale-100 transition-all active:scale-90 shadow-2xl`}
                >
                  <svg className="w-8 h-8 transform rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </form>
            </footer>
          </div>
        ) : (
          /* --- CALL VIEW (VOICE-FIRST) --- */
          <div className={`absolute inset-0 ${persona === 'bhai' ? 'bg-[#0a0c14]' : 'bg-[#140a0e]'} flex flex-col items-center justify-center z-50 text-white p-12 animate-in fade-in zoom-in duration-700`}>
            
            <div className="absolute top-20 flex flex-col items-center text-center max-w-sm">
              <div className={`w-36 h-36 ${persona === 'bhai' ? 'bg-indigo-600/10 text-indigo-500 border-indigo-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'} rounded-[3.5rem] flex items-center justify-center text-7xl shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-pulse backdrop-blur-3xl border`}>
                {persona === 'bhai' ? '🛡️' : '💖'}
              </div>
              <h2 className="mt-12 text-5xl font-black tracking-tighter uppercase italic">
                {persona === 'bhai' ? 'Bhai' : 'Didi'} <span className="opacity-30">Active</span>
              </h2>
              <p className="text-white/30 font-bold mt-5 uppercase text-[12px] tracking-[0.5em] px-10 leading-relaxed">
                Be-khauf ho ke bol. Main pura sun raha hoon.
              </p>
            </div>

            {/* --- Dynamic Visualizer --- */}
            <div className="relative flex items-center justify-center w-full max-w-md h-96">
              <div className={`absolute w-80 h-80 border-2 ${persona === 'bhai' ? 'border-indigo-500/5' : 'border-rose-500/5'} rounded-full transition-all duration-1000 ${isSpeaking ? 'scale-[1.8] opacity-0' : 'scale-100 opacity-20'}`}></div>
              
              <div className="z-10 text-center flex flex-col items-center">
                 {isSpeaking ? (
                   <div className="flex flex-col items-center">
                      <div className="flex gap-2.5 items-end h-24 mb-6">
                         {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                           <div 
                            key={i} 
                            className={`w-2 rounded-full animate-wave ${persona === 'bhai' ? 'bg-indigo-500' : 'bg-rose-500'} shadow-[0_0_15px_rgba(0,0,0,0.2)]`} 
                            style={{ 
                              height: `${30 + Math.random()*70}%`, 
                              animationDelay: `${i*60}ms`,
                              animationDuration: `${0.5 + Math.random()}s`
                            }}
                           ></div>
                         ))}
                      </div>
                      <div className={`px-6 py-2 rounded-full border ${persona === 'bhai' ? 'border-indigo-500/30 text-indigo-400' : 'border-rose-500/30 text-rose-400'} font-black uppercase text-[11px] tracking-widest animate-pulse`}>
                        {persona === 'bhai' ? 'Bhai is speaking' : 'Didi is speaking'}
                      </div>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center">
                      <div className="w-6 h-6 bg-green-500 rounded-full animate-ping mb-6 shadow-[0_0_30px_#22c55e]"></div>
                      <p className="text-green-500 font-black uppercase text-sm tracking-[0.3em]">Listening...</p>
                      <p className="text-white/10 text-[9px] mt-3 font-black uppercase tracking-[0.2em] bg-white/5 px-4 py-1.5 rounded-full">Barge-in Enabled</p>
                   </div>
                 )}
              </div>
            </div>

            {/* --- Controls --- */}
            <div className="absolute bottom-24 flex flex-col items-center">
                <button 
                  onClick={stopCall}
                  className="bg-red-500 hover:bg-red-600 text-white w-28 h-28 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.3)] active:scale-90 transition-all group border-8 border-white/5"
                >
                  <svg className="w-12 h-12 transform rotate-135 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg>
                </button>
                <p className="mt-8 text-white/20 font-black uppercase tracking-[0.5em] text-[10px]">End Session</p>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.3; }
          50% { transform: scaleY(1.3); opacity: 1; filter: brightness(1.2); }
        }
        .animate-wave {
          animation: wave 0.8s ease-in-out infinite;
          transform-origin: center;
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 20px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
        body {
          -webkit-tap-highlight-color: transparent;
        }
      `}} />
    </div>
  );
};

export default App;