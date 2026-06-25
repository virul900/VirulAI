import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ChevronDown, ChevronUp, Play, Paperclip, Mic, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage } from '@/src/services/geminiService';
import { cn } from '@/src/lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
  isLast?: boolean;
}

const MessageBubble = memo(({ message, onRetry, isLast }: MessageBubbleProps) => {
  const isModel = message.role === 'model';
  const [showThought, setShowThought] = React.useState(false);
  
  const text = message.parts.map(p => p.text || '').join('');
  const isError = isModel && (
    text.includes("exceeded the Gemini API free-tier quota limits") ||
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("experiencing extremely high demand") ||
    text.includes("503 Service Unavailable") ||
    text.startsWith("❌") ||
    text.includes("Failed to communicate with Virul")
  );

  return (
    <div className={cn("flex flex-col mb-6 gap-2", isModel ? "items-start" : "items-end")}>
      <div className={cn(
        "flex flex-col max-w-[85%] md:max-w-[75%]",
        isModel ? "items-start" : "items-end"
      )}>
        <div className="flex flex-col gap-2 w-full">
          {/* Visual parts (images/videos/files) */}
          <div className={cn("flex flex-wrap gap-2", !isModel && "justify-end")}>
            {message.parts.map((part, i) => {
              if (!part.inlineData) return null;
              const isVideo = part.inlineData.mimeType.startsWith('video');
              const isImage = part.inlineData.mimeType.startsWith('image');
              const isAudio = part.inlineData.mimeType.startsWith('audio');
              const hasData = !!part.inlineData.data;

              if (!hasData) {
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200/80 rounded-2xl text-slate-500 shadow-sm min-w-[190px]">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                      {isImage ? (
                        <ImageIcon size={18} className="text-slate-400" />
                      ) : isVideo ? (
                        <Play size={18} className="text-slate-400 fill-slate-400" />
                      ) : isAudio ? (
                        <Mic size={18} className="text-slate-400" />
                      ) : (
                        <Paperclip size={18} className="text-slate-400" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        {isImage ? "Image" : isVideo ? "Video Clip" : isAudio ? "Voice Note" : "File"}
                      </span>
                      <span className="text-xs font-bold text-slate-600">Saved in History</span>
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={i} className={cn(
                  "relative rounded-2xl overflow-hidden group",
                  isImage ? "bg-transparent border-0 outline-none" : "border bg-black border-slate-200/10"
                )}>
                  {isVideo ? (
                    <div className="w-48 h-28 flex items-center justify-center">
                      <Play className="text-white opacity-80" size={24} />
                      <video 
                        src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}
                        className="absolute inset-0 w-full h-full object-cover opacity-60"
                        controls
                      />
                    </div>
                  ) : isImage ? (
                    <img
                      src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}
                      alt="Uploaded visual"
                      className="max-w-[14rem] max-h-[14rem] object-cover outline-none border-0"
                      loading="lazy"
                    />
                  ) : isAudio ? (
                    <div className="flex flex-col gap-2 p-3 bg-white border border-slate-200 rounded-2xl min-w-[240px] shadow-sm text-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-red-50 rounded-lg">
                          <Mic className="text-red-500" size={16} />
                        </div>
                        <span className="text-xs font-bold text-slate-700">Voice Note</span>
                      </div>
                      <audio
                        src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}
                        controls
                        className="w-full h-8 outline-none focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                        <Paperclip className="text-blue-400" size={20} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Attached File</span>
                        <span className="text-xs font-bold text-white truncate max-w-[100px]">{part.inlineData.mimeType.split('/')[1].toUpperCase()}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Thought process */}
          {isModel && message.thought && (
            <div className="bg-slate-200/50 rounded-2xl overflow-hidden mb-1 w-fit border border-slate-200">
              <button
                onClick={() => setShowThought(!showThought)}
                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-colors"
                aria-label="Toggle Reasoning"
              >
                {showThought ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Reasoning
              </button>
              <AnimatePresence>
                {showThought && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-3 pb-3 text-xs text-slate-600 border-t border-slate-200 whitespace-pre-wrap max-w-md"
                    >
                      {message.thought}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Text content bubble */}
          {isError ? (
            <div className="px-5 py-4 bg-rose-50 border border-rose-100 rounded-2xl shadow-[0_4px_12px_rgba(244,63,94,0.06)] text-slate-800 w-full flex items-start gap-3.5 max-w-xl">
              <div className="p-2 bg-rose-100/70 rounded-xl text-rose-600 shrink-0 mt-0.5 border border-rose-200/50">
                <AlertTriangle size={18} />
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex flex-col gap-0.5">
                  <h4 className="font-bold text-sm text-rose-950 leading-none">AI Service Interrupted</h4>
                  <p className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest mt-1">Free-Tier Quota Limit Reached</p>
                </div>
                <div className="text-xs text-rose-800/90 leading-relaxed font-medium">
                  {text}
                </div>
                {onRetry && isLast && (
                  <div className="flex items-center gap-3 mt-1 pt-2 border-t border-rose-200/40">
                    <button
                      onClick={onRetry}
                      className="text-[11px] font-black text-rose-700 hover:text-rose-900 transition-colors uppercase tracking-widest cursor-pointer hover:underline outline-none"
                    >
                      Retry Generation
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={cn(
              "px-5 py-3 break-words transition-all duration-300",
              isModel 
                ? "bg-white text-slate-800 border border-slate-200/80 rounded-md shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]" 
                : "bg-blue-600 text-white rounded-md shadow-[0_4px_12px_-4px_rgba(37,99,235,0.25)] font-semibold"
            )}>
              <div className={cn(
                "prose prose-sm max-w-none chat-content break-words",
                isModel ? "text-slate-700" : "text-white"
              )}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {text}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
