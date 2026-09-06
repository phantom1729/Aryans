import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  LiveServerMessage,
  Modality,
  Chat,
  GenerateContentResponse,
  ThinkingLevel,
} from '@google/genai';
import { Persona, Message, MoodType, MoodEntry, HistoryItem } from './types';
import {
  createGeminiClient,
  getSystemPrompt,
  encodeAudio,
  decodeAudio,
  decodeAudioData,
  getApiKey,
} from './services/gemini';
import { BackgroundAtmosphere } from './components/BackgroundAtmosphere';
import { MoodDashboard } from './components/MoodDashboard';
import { CallModal } from './components/CallModal';
import { ChatMessage } from './components/ChatMessage';
import {
  Phone,
  Trash2,
  Send,
  Smile,
} from 'lucide-react';

const HISTORY_KEY = 'bhai_didi_permanent_v9';
const MOOD_HISTORY_KEY = 'bhai_didi_mood_history_v9';
const CURRENT_MOOD_KEY = 'bhai_didi_current_mood_v9';

export const App: React.FC = () => {
  const [view, setView] = useState<'chat' | 'call'>('chat');
  const [persona, setPersona] = useState<Persona>('bhai');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Mute state for Live Call
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);

  // Mood Dashboard state
  const [isMoodOpen, setIsMoodOpen] = useState(false);
  const [currentMood, setCurrentMood] = useState<MoodType>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_MOOD_KEY);
      return (saved as MoodType) || 'chill';
    } catch {
      return 'chill';
    }
  });
  const [moodHistory, setMoodHistory] = useState<MoodEntry[]>(() => {
    try {
      const saved = localStorage.getItem(MOOD_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Audio Context and Live API Refs
  const audioCtxRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const liveSessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const chatInstanceRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep isMutedRef in sync with isMuted state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Load hidden permanent chat history from localStorage
  const getHiddenHistory = useCallback((): HistoryItem[] => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, []);

  const saveToHistory = useCallback(
    (role: 'user' | 'model', text: string) => {
      const history = getHiddenHistory();
      history.push({ role, parts: [{ text }] });
      const trimmed = history.slice(-100);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      } catch (err) {
        console.warn('Could not save to localStorage', err);
      }
    },
    [getHiddenHistory]
  );

  // Clear all memories / restart conversation
  const clearHistory = () => {
    const isBhai = persona === 'bhai';
    const confirmMsg = isBhai
      ? 'Oye! Saari purani yaadein aur baatein clear kar du? Ekdum fresh start karein?'
      : 'Kya aap sach mein saari purani baatein bhulana chahte hain? Hum bilkul nayi shuruat karenge.';

    if (window.confirm(confirmMsg)) {
      localStorage.removeItem(HISTORY_KEY);
      const initialText = isBhai
        ? 'Oye hero! Sab clear kar diya maine. Ab bata abhi kya scene chal raha hai? 😎'
        : 'Maine sab bhula diya... chalo ek nayi aur pyaari shuruat karte hain. Batao kya haal hai? 💖';

      const resetMsg: Message = {
        id: 'msg-' + Date.now(),
        role: 'model',
        text: initialText,
        timestamp: Date.now(),
      };
      setMessages([resetMsg]);
      chatInstanceRef.current = null;
    }
  };

  // Handle Mood Selection
  const handleSelectMood = (mood: MoodType) => {
    setCurrentMood(mood);
    try {
      localStorage.setItem(CURRENT_MOOD_KEY, mood);
    } catch (e) {
      console.warn(e);
    }

    const newEntry: MoodEntry = {
      id: 'mood-' + Date.now(),
      mood,
      label: mood,
      emoji: mood === 'chill' ? '😎' : mood === 'happy' ? '🥳' : mood === 'stressed' ? '😰' : mood === 'sad' ? '🥺' : mood === 'motivated' ? '🚀' : '😤',
      timestamp: Date.now(),
      advice: {
        bhai: 'Bhai baitha hai na, chill kar!',
        didi: 'Didi sab theek kar degi, bharosa rakho.',
      },
    };

    setMoodHistory((prev) => {
      const updated = [...prev, newEntry].slice(-30);
      try {
        localStorage.setItem(MOOD_HISTORY_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn(e);
      }
      return updated;
    });

    // Reset chat instance so the new mood is injected into subsequent responses
    chatInstanceRef.current = null;
  };

  // Switch persona or initialize
  useEffect(() => {
    const saved = getHiddenHistory();
    if (saved.length > 0) {
      const msgs: Message[] = saved.map((h, i) => ({
        id: `hist-${i}`,
        role: h.role,
        text: h.parts?.[0]?.text || '',
      }));
      setMessages(msgs);
    } else {
      const isBhai = persona === 'bhai';
      const welcome: Message = {
        id: 'msg-init',
        role: 'model',
        text: isBhai
          ? 'Oye! Tera Bhai yahan hai. Bol kya scene hai? Bina dare sab kuch bol de. 😎'
          : 'Main hoon na... dil halka kar lo. Tumhari Didi sab samajh rahi hai. 💖',
        timestamp: Date.now(),
      };
      setMessages([welcome]);
      saveToHistory('model', welcome.text);
    }
    chatInstanceRef.current = null;
  }, [persona, getHiddenHistory, saveToHistory]);

  // Auto-scroll to bottom of chat smoothly
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Fast streaming message sender
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText ?? inputText).trim();
    if (!textToSend || isTyping) return;

    if (!customText) {
      setInputText('');
    }

    const userMessage: Message = {
      id: 'msg-' + Date.now(),
      role: 'user',
      text: textToSend,
      timestamp: Date.now(),
      moodTag: currentMood,
    };

    setMessages((prev) => [...prev, userMessage]);
    saveToHistory('user', textToSend);
    setIsTyping(true);

    try {
      const ai = createGeminiClient();

      // Create new chat session if not present
      if (!chatInstanceRef.current) {
        const history = getHiddenHistory();
        const formattedHistory = history.slice(-40).map((h) => ({
          role: h.role,
          parts: h.parts,
        }));

        chatInstanceRef.current = ai.chats.create({
          model: 'gemini-3.8-flash',
          history: formattedHistory.slice(0, -1),
          config: {
            systemInstruction: getSystemPrompt(persona, currentMood),
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            temperature: 0.85,
          },
        });
      }

      // Stream response with minimal latency
      const streamResponse = await chatInstanceRef.current.sendMessageStream({
        message: textToSend,
      });

      const modelMessageId = 'msg-' + (Date.now() + 1);
      let accumulatedText = '';

      setMessages((prev) => [
        ...prev,
        {
          id: modelMessageId,
          role: 'model',
          text: '',
          timestamp: Date.now(),
        },
      ]);

      for await (const chunk of streamResponse) {
        const part = chunk as GenerateContentResponse;
        if (part.text) {
          accumulatedText += part.text;
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.id === modelMessageId) {
              last.text = accumulatedText;
            }
            return copy;
          });
        }
      }

      saveToHistory('model', accumulatedText);
    } catch (err: any) {
      console.error('Chat error:', err);
      let errorMsg = 'Server se connect nahi ho pa raha... thoda network check kar lo?';
      if (err.message === 'API_KEY_MISSING') {
        errorMsg =
          'API Key missing hai! Netlify ya App settings mein VITE_API_KEY add karein taaki Bhai/Didi respond kar sakein.';
      } else if (err.message?.includes('API key not valid')) {
        errorMsg = 'API Key galat hai boss! Please valid Gemini API key check karein.';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'model',
          text: errorMsg,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Stop Live Call
  const stopCall = useCallback(() => {
    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch (e) {
        console.warn(e);
      }
      liveSessionRef.current = null;
    }

    if (audioCtxRef.current) {
      if (audioCtxRef.current.input.state !== 'closed') {
        try {
          audioCtxRef.current.input.close();
        } catch (e) {}
      }
      if (audioCtxRef.current.output.state !== 'closed') {
        try {
          audioCtxRef.current.output.close();
        } catch (e) {}
      }
      audioCtxRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    activeSources.current.forEach((src) => {
      try {
        src.stop();
      } catch (e) {}
    });
    activeSources.current.clear();

    setIsSpeaking(false);
    setIsMuted(false);
    isMutedRef.current = false;
    setView('chat');
  }, []);

  // Toggle Mute during Live Call
  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      return next;
    });
  };

  // Start Live Audio Call with Gemini Live API
  const startCall = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      alert('API Key missing hai! Netlify ya platform settings mein VITE_API_KEY add karein.');
      return;
    }

    setView('call');
    setIsMuted(false);
    isMutedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = { input: inCtx, output: outCtx };

      const ai = createGeminiClient();
      const history = getHiddenHistory();
      const memoryContext =
        history.length > 0
          ? `\nRECENT_CONVERSATION_MEMORY: ${JSON.stringify(history.slice(-15))}`
          : '';

      const sessionPromise = ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        callbacks: {
          onopen: () => {
            const source = inCtx.createMediaStreamSource(stream);
            // 2048 buffer size cuts latency down to ~128ms per frame
            const scriptProcessor = inCtx.createScriptProcessor(2048, 1, 1);

            scriptProcessor.onaudioprocess = (e) => {
              // MUTE CHECK: If user pressed Mute, DO NOT SEND ANY AUDIO to AI!
              if (isMutedRef.current) {
                return;
              }

              const input = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) {
                int16[i] = input[i] * 32768;
              }

              sessionPromise.then((session) => {
                try {
                  // Use modern 'audio' field instead of deprecated 'media'
                  session.sendRealtimeInput({
                    audio: {
                      data: encodeAudio(new Uint8Array(int16.buffer)),
                      mimeType: 'audio/pcm;rate=16000',
                    },
                  });
                } catch (sendErr) {
                  console.warn('Realtime input error:', sendErr);
                }
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.interrupted) {
              activeSources.current.forEach((s) => {
                try {
                  s.stop();
                } catch (e) {}
              });
              activeSources.current.clear();
              setIsSpeaking(false);
              nextStartTimeRef.current = 0;
              return;
            }

            const base64Audio =
              msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

            if (base64Audio && audioCtxRef.current) {
              setIsSpeaking(true);
              const ctx = audioCtxRef.current.output;

              if (ctx.state === 'suspended') {
                await ctx.resume();
              }

              nextStartTimeRef.current = Math.max(
                nextStartTimeRef.current,
                ctx.currentTime
              );

              const buffer = await decodeAudioData(
                decodeAudio(base64Audio),
                ctx,
                24000,
                1
              );

              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);

              source.onended = () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) {
                  setIsSpeaking(false);
                }
              };

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSources.current.add(source);
            }
          },
          onclose: () => stopCall(),
          onerror: (err) => {
            console.error('Live session error:', err);
            stopCall();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                // Bhai = Puck, Didi = Kore as requested
                voiceName: persona === 'bhai' ? 'Puck' : 'Kore',
              },
            },
          },
          systemInstruction:
            getSystemPrompt(persona, currentMood) +
            `\n${memoryContext}\nSPEED & NATURAL DELIVERY: Talk like a living, loving sibling who speaks instantly with realistic emotion, empathy, warm tone, natural pauses, and genuine care.`,
        },
      });

      liveSessionRef.current = await sessionPromise;
    } catch (e) {
      console.error('Failed to start call:', e);
      alert('Microphone access allow karein taaki call connect ho sake.');
      stopCall();
    }
  };

  const isBhai = persona === 'bhai';

  return (
    <div className="flex flex-col h-screen w-full text-slate-800 overflow-hidden relative select-none">
      {/* Dynamic Animated Background */}
      <BackgroundAtmosphere
        persona={persona}
        currentMood={currentMood}
        isCalling={view === 'call'}
      />

      {/* Navigation Header */}
      <header className="relative z-30 h-16 sm:h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/70 flex items-center justify-between px-3 sm:px-6 shadow-sm">
        {/* Left Branding */}
        <div className="flex items-center gap-2.5 sm:gap-4 flex-shrink-0">
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl text-white text-xl sm:text-2xl shadow-xl transition-all duration-300 ${
              isBhai ? 'bg-indigo-600 shadow-indigo-200' : 'bg-rose-500 shadow-rose-200'
            }`}
          >
            {isBhai ? '🛡️' : '💖'}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <h1 className="font-black text-xs sm:text-lg tracking-tight uppercase leading-none text-slate-900">
                {isBhai ? 'Bhai' : 'Didi'} AI
              </h1>
              <span
                className={`text-[8px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider text-white ${
                  isBhai ? 'bg-indigo-600' : 'bg-rose-500'
                }`}
              >
                V3.8
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-[8px] sm:text-[10px] text-slate-500 font-bold tracking-wider">
                Permanent Memory Active
              </p>
            </div>
          </div>
        </div>

        {/* Center: Persona Switcher */}
        <div className="flex bg-slate-100/90 backdrop-blur-md p-1 rounded-2xl border border-slate-200/50 w-28 sm:w-48 mx-1">
          <button
            id="switch-persona-bhai"
            onClick={() => setPersona('bhai')}
            className={`flex-1 py-1 sm:py-2 rounded-xl text-[9px] sm:text-[12px] font-black uppercase transition-all duration-200 ${
              isBhai
                ? 'bg-white text-indigo-600 shadow-sm scale-[1.03]'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Bhai
          </button>
          <button
            id="switch-persona-didi"
            onClick={() => setPersona('didi')}
            className={`flex-1 py-1 sm:py-2 rounded-xl text-[9px] sm:text-[12px] font-black uppercase transition-all duration-200 ${
              !isBhai
                ? 'bg-white text-rose-500 shadow-sm scale-[1.03]'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Didi
          </button>
        </div>

        {/* Right Actions: Mood Dashboard, Memory Clear, Call */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Mood Dashboard Trigger Button */}
          <button
            id="open-mood-dashboard-btn"
            onClick={() => setIsMoodOpen(true)}
            className={`px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border flex items-center gap-1.5 font-bold text-xs sm:text-sm transition-all shadow-sm ${
              isBhai
                ? 'bg-indigo-50/80 border-indigo-200 text-indigo-900 hover:bg-indigo-100'
                : 'bg-rose-50/80 border-rose-200 text-rose-900 hover:bg-rose-100'
            }`}
            title="Open Mood Dashboard"
          >
            <Smile className="w-4 h-4 text-amber-500" />
            <span className="capitalize hidden md:inline font-bold">
              Mood: {currentMood}
            </span>
          </button>

          {/* Clear Memories */}
          <button
            id="clear-history-btn"
            onClick={clearHistory}
            className="p-2 sm:p-2.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all border border-slate-200/80 group"
            title="Clear Chat Memories"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Start Call Button */}
          <button
            id="start-call-header-btn"
            onClick={startCall}
            className={`flex items-center gap-1.5 sm:gap-2 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-xl uppercase transition-all hover:brightness-110 active:scale-95 ${
              isBhai ? 'bg-indigo-600' : 'bg-rose-500'
            }`}
          >
            <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Call {isBhai ? 'Bhai' : 'Didi'}</span>
            <span className="sm:hidden">Call</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 relative z-10 overflow-hidden flex flex-col">
        {/* Messages list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 md:space-y-6 scroll-smooth"
        >
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} persona={persona} />
          ))}

          {/* Fast Typing bounce indicator */}
          {isTyping && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl rounded-tl-none border border-slate-200/80 flex items-center gap-2 shadow-sm">
                <div
                  className={`w-2 h-2 rounded-full animate-bounce ${
                    isBhai ? 'bg-indigo-500' : 'bg-rose-400'
                  }`}
                />
                <div
                  className={`w-2 h-2 rounded-full animate-bounce delay-150 ${
                    isBhai ? 'bg-indigo-500' : 'bg-rose-400'
                  }`}
                />
                <div
                  className={`w-2 h-2 rounded-full animate-bounce delay-300 ${
                    isBhai ? 'bg-indigo-500' : 'bg-rose-400'
                  }`}
                />
                <span className="text-xs text-slate-400 font-semibold ml-1">
                  {isBhai ? 'Bhai soch raha hai...' : 'Didi type kar rahi hain...'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <footer className="p-3 sm:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="max-w-4xl mx-auto relative flex items-center gap-2 sm:gap-4"
          >
            <input
              id="chat-message-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Apne ${isBhai ? 'Bhai' : 'Didi'} se dil ki baat karein...`}
              className="flex-1 bg-slate-100/90 border-2 border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl px-5 py-3.5 sm:py-4 outline-none transition-all text-slate-800 placeholder-slate-400 font-medium text-sm sm:text-base shadow-inner"
            />
            <button
              id="send-message-btn"
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className={`flex-shrink-0 text-white w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-25 transition-all shadow-xl ${
                isBhai ? 'bg-indigo-600 shadow-indigo-200' : 'bg-rose-500 shadow-rose-200'
              }`}
              title="Send Message"
            >
              <Send className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </form>
        </footer>
      </main>

      {/* Mood Dashboard Modal */}
      <MoodDashboard
        isOpen={isMoodOpen}
        onClose={() => setIsMoodOpen(false)}
        persona={persona}
        currentMood={currentMood}
        onSelectMood={handleSelectMood}
        onTalkAboutMood={(prompt) => handleSendMessage(prompt)}
        moodHistory={moodHistory}
      />

      {/* Live Voice Call Modal with MUTE Button */}
      <CallModal
        isOpen={view === 'call'}
        persona={persona}
        isSpeaking={isSpeaking}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onEndCall={stopCall}
      />
    </div>
  );
};

export default App;
