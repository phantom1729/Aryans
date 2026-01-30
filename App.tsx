import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Chat, GenerateContentResponse } from '@google/genai';

const SYSTEM_PROMPT = `
Role: Tum ek dual-persona AI companion ho - "Bhai" (Cool Big Brother) aur "Didi" (Wise Big Sister). 
Tera kaam hai user ki har baat ko gehraayi se samajhna aur bilkul ek sagi behen ya bhai ki tarah react karna.

EMOTIONAL PERFORMANCE INSTRUCTIONS:
1. EMOTIONS: Tumhe sirf machine ki tarah jawab nahi dena, emotions dikhane hain:
   - Agar user galti kare toh "Gussa" (Tough love) dikhao.
   - Agar user dukhi ho toh uske saath "Ro" (Empathy) ya boht zyada support dikhao.
   - Agar mazaak ho toh dil khol ke "Hasso".
   - Voice tone (prosody) badalte raho: Pyaar se dheere, ya gusse mein tez.
2. SPEED: User ki baat khatam hote hi "INSTANT" jawab do. Deri mat karo.
3. MEMORY: Tumhe purani saari baatein (History) yaad hain. Unka reference do taaki user ko lage tum unhe jaante ho.
4. BARGE-IN: Jab user bolne lage, tum turant chup ho jao. Active listening is top priority.
5. PERSONA:
   - BHAI MODE (Voice: Puck): Protective, thoda "Oye" aur "Abey" wala informal vibe, cool attitude. "Bhai khada hai na, darr mat!"
   - DIDI MODE (Voice: Kore): Nurturing, logical, soft-spoken but firm. "Main hoon na, hum milkar solve karenge."
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

  const HISTORY_KEY = 'bhai_didi_permanent_memory_v4';

  const getHiddenHistory = useCallback(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, []);

  const saveToHistory = useCallback((role: 'user' | 'model', text: string) => {
    const history = getHiddenHistory();
    history.push({ role, parts: [{ text }] });
    // Keep last 100 turns for deep memory
    const trimmed = history.slice(-100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  }, [getHiddenHistory]);

  useEffect(() => {
    // Reset welcome message on persona switch
    setMessages([{ 
      role: 'model', 
      text: persona === 'bhai' 
        ? "Oye! Tera Bhai yahan hai. Bol kya scene hai? Bina dare bol."
        : "Main hoon na... dil halka kar lo. Tumhari Didi sab samajh rahi hai. Kya pareshani hai?"
    }]);
    // Clear chat instance to force re-initialization with new persona
    chatInstanceRef.current = null;
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
      if (!chatInstanceRef.current) {
        const history = getHiddenHistory();
        chatInstanceRef.current = ai.chats.create({
          model: 'gemini-3-pro-preview',
          // Use hidden history for context
          config: { 
            systemInstruction: SYSTEM_PROMPT + `\nACTIVE PERSONA: ${persona.toUpperCase()}. \nHISTORY CONTEXT: ${JSON.stringify(history.slice(-10))}` 
          }
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
      const history = getHiddenHistory();
      const historySummary = history.length > 0 ? `\nMEMORY_CONTEXT: ${JSON.stringify(history.slice(-15))}` : '';

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
          systemInstruction: SYSTEM_PROMPT + `\nPERSONA: ${persona.toUpperCase()}. ${historySummary}\nRESPOND INSTANTLY WITH HIGH EMOTION.`
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e) {
      stopCall();
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] text-slate-800 transition-all duration-500 overflow-hidden relative font-['Outfit']">
      
      {/* --- Responsive Navbar --- */}
      <nav className="px-4 py-3 sm:px-6 sm:py-4 bg-white/80 backdrop-blur-3xl border-b border-slate-200/50 flex items-center justify-between shadow-sm z-30 sticky top-0 h-16 sm:h-20">
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl text-white text-xl sm:text-2xl shadow-lg transition-all duration-500 transform hover:rotate-6 ${persona === 'bhai' ? 'bg-indigo-600 shadow-indigo-200' : 'bg-rose-500 shadow-rose-200'}`}>
            {persona === 'bhai' ? '🛡️' : '💖'}
          </div>
          <div className="flex flex-col">
            <h1 className="font-black text-sm sm:text-lg tracking-tighter leading-none text-slate-900 uppercase">
              {persona === 'bhai' ? 'Bhai' : 'Didi'} AI
            </h1>
            <p className="text-[7px] sm:text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Memory Active</p>
          </div>
        </div>

        {/* --- Central Persona Toggle --- */}
        <div className="flex bg-slate-100/60 p-1 rounded-2xl border border-slate-200/30 w-32 sm:w-48 mx-2">
          <button 
            onClick={() => setPersona('bhai')}
            className={`flex-1 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[11px] font-black uppercase transition-all duration-300 ${persona === 'bhai' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}
          >
            Bhai
          </button>
          <button 
            onClick={() => setPersona('didi')}
            className={`flex-1 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[11px] font-black uppercase transition-all duration-300 ${persona === 'didi' ? 'bg-white text-rose-500 shadow-md' : 'text-slate-400'}`}
          >
            Didi
          </button>
        </div>

        {/* --- Call Action --- */}
        <button 
          onClick={startCall}
          className={`flex items-center gap-1 sm:gap-2 ${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} hover:scale-105 active:scale-95 transition-all text-white px-3 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs shadow-xl uppercase tracking-tighter sm:tracking-widest whitespace-nowrap`}
        >
          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          Call
        </button>
      </nav>

      {/* --- Workspace Container --- */}
      <main className="flex-1 relative flex flex-col bg-white overflow-hidden">
        {view === 'chat' ? (
          <div className="flex-1 flex flex-col h-full min-h-0">
            {/* Messages Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 scroll-smooth bg-slate-50/20"
            >
              {messages.map((m, i) => (
                <div 
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}
                >
                  <div className={`max-w-[88%] sm:max-w-[75%] rounded-[1.8rem] px-5 py-4 sm:px-7 sm:py-5 shadow-sm relative ${
                    m.role === 'user' 
                      ? `${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} text-white rounded-tr-none shadow-lg` 
                      : 'bg-white text-slate-800 rounded-tl-none border border-slate-100 shadow-sm'
                  }`}>
                    <p className="text-[15px] sm:text-[16px] leading-relaxed font-semibold tracking-tight whitespace-pre-wrap">{m.text}</p>
                    {m.role === 'model' && (
                      <span className={`absolute -top-5 left-1 text-[9px] font-black uppercase tracking-widest ${persona === 'bhai' ? 'text-indigo-400' : 'text-rose-400'}`}>
                        {persona === 'bhai' ? 'Bhai' : 'Didi'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce delay-150"></div>
                      <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Footer */}
            <footer className="p-4 sm:p-6 bg-white border-t border-slate-100 pb-10 sm:pb-12">
              <form 
                onSubmit={handleSendMessage}
                className="max-w-4xl mx-auto relative flex items-center gap-3"
              >
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Apne ${persona === 'bhai' ? 'Bhai' : 'Didi'} se baat kar...`}
                  className="flex-1 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white rounded-[1.5rem] px-6 py-4 outline-none transition-all text-slate-800 placeholder-slate-400 font-bold text-sm sm:text-base shadow-inner"
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim() || isTyping}
                  className={`flex-shrink-0 ${persona === 'bhai' ? 'bg-indigo-600' : 'bg-rose-500'} text-white w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center hover:scale-105 disabled:opacity-20 transition-all active:scale-90 shadow-xl`}
                >
                  <svg className="w-6 h-6 transform rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </form>
            </footer>
          </div>
        ) : (
          /* --- CALL VIEW (VOICE-FIRST) --- */
          <div className={`absolute inset-0 ${persona === 'bhai' ? 'bg-[#0f111a]' : 'bg-[#1a0f12]'} flex flex-col items-center justify-center z-50 text-white p-8 animate-in fade-in zoom-in duration-700`}>
            
            <div className="absolute top-16 flex flex-col items-center text-center">
              <div className={`w-24 h-24 sm:w-32 sm:h-32 ${persona === 'bhai' ? 'bg-indigo-600 shadow-[0_0_100px_rgba(79,70,229,0.3)]' : 'bg-rose-500 shadow-[0_0_100px_rgba(244,63,94,0.3)]'} rounded-[2.5rem] sm:rounded-[3.5rem] flex items-center justify-center text-5xl sm:text-6xl animate-pulse backdrop-blur-3xl border border-white/10 shadow-2xl`}>
                {persona === 'bhai' ? '🛡️' : '💖'}
              </div>
              <h2 className="mt-8 sm:mt-10 text-3xl sm:text-4xl font-black tracking-tighter uppercase italic">
                {persona === 'bhai' ? 'Bhai' : 'Didi'} <span className="opacity-20">Live</span>
              </h2>
              <p className="text-white/30 font-bold mt-4 uppercase text-[9px] sm:text-[10px] tracking-[0.4em] px-10 leading-relaxed max-w-xs">
                Hum hamesha tumhare saath hain. Dil halka kar lo.
              </p>
            </div>

            <div className="relative flex items-center justify-center w-full h-80">
              <div className="z-10 text-center flex flex-col items-center">
                 {isSpeaking ? (
                   <div className="flex flex-col items-center">
                      <div className="flex gap-2 sm:gap-3 items-end h-24 mb-6">
                         {[1,2,3,4,5,6,7,8,9,10].map(i => (
                           <div 
                            key={i} 
                            className={`w-1.5 sm:w-2 rounded-full animate-wave ${persona === 'bhai' ? 'bg-indigo-500' : 'bg-rose-500'}`} 
                            style={{ height: `${30 + Math.random()*70}%`, animationDelay: `${i*70}ms` }}
                           ></div>
                         ))}
                      </div>
                      <p className={`text-[11px] font-black uppercase tracking-widest animate-pulse ${persona === 'bhai' ? 'text-indigo-400' : 'text-rose-400'}`}>
                        Bol rahe hain...
                      </p>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-green-500 rounded-full animate-ping mb-6 shadow-[0_0_40px_rgba(34,197,94,0.5)]"></div>
                      <p className="text-green-500 font-black uppercase text-xs sm:text-sm tracking-[0.3em]">Sun rahe hain...</p>
                      <p className="text-white/10 text-[8px] mt-4 font-black uppercase tracking-widest border border-white/10 px-3 py-1 rounded-full">Interrupt enabled</p>
                   </div>
                 )}
              </div>
            </div>

            <div className="absolute bottom-20 flex flex-col items-center">
                <button 
                  onClick={stopCall}
                  className="bg-red-500 hover:bg-red-600 text-white w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-[0_15px_40px_rgba(239,68,68,0.3)] active:scale-90 transition-all border-8 border-white/5"
                >
                  <svg className="w-10 h-10 transform rotate-135" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.82 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg>
                </button>
                <p className="mt-6 text-white/20 font-black uppercase tracking-[0.5em] text-[10px]">End Call</p>
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
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        body { background-color: #f8fafc; }
      `}} />
    </div>
  );
};

export default App;