import React, { useRef, useState, useEffect } from 'react';
import { ArrowUp, Image as ImageIcon, Video, Paperclip, X, Square, Camera, Mic, Brain, Globe, ChevronRight, LayoutGrid, Bot, Sliders, Compass, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { fileToBase64, MessagePart, getSuggestions, ChatMessage } from '@/src/services/geminiService';

interface ChatInputProps {
  onSend: (parts: MessagePart[], virulSearch: boolean, virulThinks: boolean) => void;
  onStop: () => void;
  disabled: boolean;
  history: ChatMessage[];
}

export default function ChatInput({ onSend, onStop, disabled, history }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<{ file: File; base64: string; previewUrl: string }[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const allFileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(null);

  // Addition Button popover states and switches
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [virulSearch, setVirulSearch] = useState(false);
  const [virulThinks, setVirulThinks] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Close addition menu hook disabled as per user instruction to only allow closing via the close button
  useEffect(() => {
    // Disabled to allow folder closing only via the close button
  }, []);

  // Camera snapshot states & refs
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Audio mic states & refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);
  const suggestionsCacheRef = useRef<Record<string, string[]>>({});
  const coolDownUntilRef = useRef<number>(0);

  useEffect(() => {
    let isCancelled = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmedInput = input.trim();
    if (trimmedInput.length >= 3 && !disabled) {
      // Check if we are currently in a cooldown period
      if (Date.now() < coolDownUntilRef.current) {
        setSuggestions([]);
        return;
      }

      // Serve from local cache immediately if available
      if (suggestionsCacheRef.current[trimmedInput]) {
        setSuggestions(suggestionsCacheRef.current[trimmedInput]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsFetchingSuggestions(true);
        try {
          const res = await getSuggestions(trimmedInput, history);
          if (!isCancelled) {
            suggestionsCacheRef.current[trimmedInput] = res;
            setSuggestions(res);
          }
        } catch (error) {
          console.warn("Suggestions error caught on frontend, initiating 30s cooldown:", error);
          // Put suggestions on a 30-second cooldown so we don't spam the rate-limited API
          coolDownUntilRef.current = Date.now() + 30000;
          if (!isCancelled) {
            setSuggestions([]);
          }
        } finally {
          if (!isCancelled) {
            setIsFetchingSuggestions(false);
          }
        }
      }, 250);
    } else {
      setSuggestions([]);
    }

    return () => {
      isCancelled = true;
    };
  }, [input, disabled, history]);

  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(att => URL.revokeObjectURL(att.previewUrl));
    };
  }, []);

  // Sync camera stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let isCancelled = false;

    if (isCameraOpen) {
      setCameraError(null);
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
          if (isCancelled) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          activeStream = stream;
          cameraStreamRef.current = stream;
          if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = stream;
            cameraVideoRef.current.play().catch(err => console.error("Video stream play failed:", err));
          }
        })
        .catch(err => {
          if (isCancelled) return;
          console.error("Webcam stream setup error:", err);
          setCameraError("Camera permission denied or camera device is not available on this system.");
        });
    }

    return () => {
      isCancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, [isCameraOpen]);

  // Clean recording timer on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    setSuggestions([]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAttachments = await Promise.all(
      files.map(async file => {
        const base64 = await fileToBase64(file);
        const previewUrl = URL.createObjectURL(file);
        return { file, base64, previewUrl };
      })
    );

    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (allFileInputRef.current) allFileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSend = () => {
    if (disabled) {
      onStop();
      return;
    }
    
    if (!input.trim() && attachments.length === 0) return;

    const parts: MessagePart[] = [];
    if (input.trim()) {
      parts.push({ text: input.trim() });
    }

    attachments.forEach(att => {
      parts.push({
        inlineData: {
          mimeType: att.file.type,
          data: att.base64
        }
      });
      URL.revokeObjectURL(att.previewUrl);
    });

    onSend(parts, virulSearch, virulThinks);
    setInput('');
    setAttachments([]);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[0]);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Webcam capture Helpers
  const captureSnapshot = () => {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      const base64 = dataUrl.split(',')[1];

      // Convert captured frame to direct file attachment properties
      const byteString = atob(base64);
      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([uint8Array], { type: 'image/jpeg' });
      const file = new File([blob], `snap_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(file);

      setAttachments(prev => [...prev, { file, base64, previewUrl }]);
      setIsCameraOpen(false);
    }
  };

  // Microphone recording Helpers
  const startRecording = async () => {
    setRecordingDuration(0);
    setRecordingError(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = reader.result?.toString().split(',')[1];
          if (base64String) {
            const file = new File([audioBlob], `vocal_${Date.now()}.webm`, { type: 'audio/webm' });
            const previewUrl = URL.createObjectURL(file);
            setAttachments(prev => [...prev, { file, base64: base64String, previewUrl }]);
          }
        };
      };

      recorder.start();
      setIsRecording(true);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Microphone setup failed:", err);
      setRecordingError("Microphone access was denied or audio input device is missing.");
    }
  };

  const stopRecording = (shouldSave: boolean) => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (!shouldSave) {
        mediaRecorderRef.current.onstop = () => {
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stream.getTracks().forEach((track: any) => track.stop());
          }
        };
      }
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 pb-3 relative z-30">
      {attachments.length > 0 && (
        <div 
          className="flex flex-wrap gap-2 mb-4 p-1 rounded-md"
        >
          {attachments.map((att, i) => (
            <div 
              key={i} 
              className={cn(
                "relative group rounded-md overflow-hidden bg-white",
                att.file.type.startsWith('image') ? "border-0 outline-none" : "border border-slate-100"
              )}
            >
              {att.file.type.startsWith('video') ? (
                <div className="w-14 h-14 flex items-center justify-center bg-blue-50">
                  <Video className="text-blue-500" size={20} />
                </div>
              ) : att.file.type.startsWith('image') ? (
                <img src={att.previewUrl} alt="preview" className="w-14 h-14 object-cover outline-none border-0" />
              ) : att.file.type.startsWith('audio') ? (
                <div className="w-14 h-14 flex items-center justify-center bg-red-50">
                  <Mic className="text-red-500" size={20} />
                </div>
              ) : (
                <div className="w-14 h-14 flex items-center justify-center bg-slate-50">
                  <Paperclip className="text-slate-500" size={20} />
                </div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute top-0.5 right-0.5 bg-black/40 text-white rounded-full p-0.5 hover:bg-black/60 transition-colors"
                title="Remove segment"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {recordingError && (
        <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 text-xs font-bold text-red-600 rounded-xl flex items-center justify-between">
          <span>{recordingError}</span>
          <button onClick={() => setRecordingError(null)} className="text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 px-1 items-start">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(s)}
              className="group flex items-center gap-3 px-4 py-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-md text-sm text-slate-700 font-medium text-left hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all shadow-none w-fit max-w-full outline-none focus:outline-none"
            >
              <span className="">{s}</span>
              <span className="hidden group-hover:inline-block text-[10px] text-blue-400 font-bold ml-auto bg-blue-100/50 px-1.5 py-0.5 rounded uppercase font-mono">Tab</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-transparent p-1" ref={menuContainerRef}>
        <div className="flex flex-col bg-white rounded-xl ring-1 ring-slate-200/90 w-full shadow-[0_2px_8px_rgba(0,0,0,0.04)] min-h-[96px] overflow-visible">
          {isRecording ? (
            <div className="flex-1 flex items-center justify-between py-4 px-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-sm font-bold text-slate-700 font-mono">
                  Recording Voice ({Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stopRecording(false)}
                  className="px-3.5 py-1.5 bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-md transition-all focus:outline-none"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => stopRecording(true)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white rounded-md transition-all focus:outline-none shadow-sm"
                >
                  Keep Notes
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Virul"
                rows={1}
                className="w-full bg-transparent border-none outline-none focus:ring-0 resize-none text-slate-700 font-semibold py-3 px-4 max-h-48 scrollbar-hide text-base leading-snug placeholder:text-slate-400"
                style={{ height: 'auto' }}
                disabled={disabled}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />

              <div className="flex items-center justify-between px-3 pb-3 pt-1.5 mt-auto">
                <div className="flex items-center gap-2">
                  {/* Active Indicators */}
                  {virulSearch && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100/60 text-[10px] font-bold">
                      <span>Virulsearch</span>
                    </div>
                  )}
                  {virulThinks && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100/60 text-[10px] font-bold">
                      <span>Virulthink</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Addition Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(true)}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-600 transition-all hover:bg-slate-200 outline-none focus:outline-none cursor-pointer"
                    title="Add attachments"
                  >
                    <span className="text-[21px] font-light leading-none select-none relative -top-[1.5px]"> +</span>
                  </button>

                  <button
                    onClick={handleSend}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center outline-none focus:outline-none transition-all",
                      disabled
                         ? "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 shadow-sm"
                         : (input.trim() || attachments.length > 0)
                          ? "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 shadow-sm"
                          : "bg-slate-100 text-slate-300 cursor-not-allowed shadow-none"
                    )}
                  >
                    {disabled ? <Square size={12} fill="currentColor" /> : <span className="font-normal text-[20px] select-none leading-none">&gt;</span>}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        hidden 
        multiple 
        accept="image/*" 
      />
      <input 
        type="file" 
        ref={cameraInputRef} 
        onChange={handleFileChange} 
        hidden 
        accept="image/*" 
        capture="environment" 
      />
      <input 
        type="file" 
        ref={videoInputRef} 
        onChange={handleFileChange} 
        hidden 
        multiple 
        accept="video/*" 
      />
      <input 
        type="file" 
        ref={allFileInputRef} 
        onChange={handleFileChange} 
        hidden 
        multiple 
      />

      <AnimatePresence>
        {/* Native inspired Folder Bottom Sheet Drawer */}
        {isMenuOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="absolute inset-0 bg-slate-900/40"
            />

            {/* Folder Sheet Container */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 24, stiffness: 280 }}
              className="relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-3xl p-6 shadow-2xl flex flex-col border border-slate-100/50 z-10 max-h-[92vh] overflow-y-auto"
            >
              {/* Folder Header Row */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xl font-bold text-slate-800 font-sans tracking-tight">Folder</span>
              </div>

              {/* Action List Section */}
              <div className="flex flex-col gap-1 mb-5">
                {/* Camera List Option */}
                <button
                  type="button"
                  onClick={() => {
                    cameraInputRef.current?.click();
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center justify-between py-2.5 px-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group w-full text-left outline-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">Camera</span>
                  </div>
                </button>

                {/* Photos List Option */}
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center justify-between py-2.5 px-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group w-full text-left outline-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">Photos</span>
                  </div>
                </button>

                {/* Videos List Option */}
                <button
                  type="button"
                  onClick={() => {
                    videoInputRef.current?.click();
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center justify-between py-2.5 px-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group w-full text-left outline-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">Videos</span>
                  </div>
                </button>

                {/* Add files / notes */}
                <button
                  type="button"
                  onClick={() => {
                    allFileInputRef.current?.click();
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center justify-between py-2.5 px-2 text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group w-full text-left outline-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">Notes</span>
                  </div>
                </button>


              </div>

              {/* Close Button at bottom */}
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="mt-4 w-full py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition-all active:scale-[0.98] outline-none cursor-pointer"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}

        {/* Micro-Feedback Toast Alert */}
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 z-50 border border-slate-700/50"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}

        {isCameraOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md border border-slate-100 flex flex-col gap-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Camera size={16} className="text-blue-600" />
                  Webcam Snapshot
                </h3>
                <button 
                  onClick={() => setIsCameraOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
                {cameraError ? (
                  <div className="p-6 text-center">
                    <p className="text-xs font-bold text-slate-400 leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCameraOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white rounded-xl transition-all"
                    >
                      Browse Images Instead
                    </button>
                  </div>
                ) : (
                  <video 
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 rounded-xl transition-all"
                >
                  Cancel
                </button>
                {!cameraError && (
                  <button
                    type="button"
                    onClick={captureSnapshot}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Camera size={14} />
                    Take Snapshot
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
