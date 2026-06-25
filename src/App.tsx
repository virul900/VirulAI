/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Menu, Sparkles, Activity, Image as ImageIcon, Map, Code, Brain, Heart, Smile, Coffee, Compass, Gift, Sun, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import ChatInput from './components/ChatInput';
import MessageBubble from './components/MessageBubble';
import { ChatMessage, streamChat, MessagePart, generateTopicTitle } from './services/geminiService';
import { cn } from './lib/utils';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import AuthModal from './components/AuthModal';
import { 
  migrateLocalChatsToCloud, 
  subscribeToUserChats, 
  saveChatToCloud, 
  deleteChatFromCloud 
} from './services/chatSync';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [user, setUser] = useState<any | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Subscribe to Firebase Auth and Firestore syncing
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Migrate offline chats to the cloud
        try {
          const savedLocal = localStorage.getItem('virul_chats');
          if (savedLocal) {
            const parsedLocal = JSON.parse(savedLocal);
            if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
              await migrateLocalChatsToCloud(currentUser.uid, parsedLocal);
            }
          }
        } catch (e) {
          console.error("Migration during state change failed", e);
        }

        // Subscribe to user cloud chats from Firestore
        const unsubscribeCloud = subscribeToUserChats(currentUser.uid, (cloudChats) => {
          if (cloudChats && cloudChats.length > 0) {
            setChats(cloudChats);
          }
        });

        return () => {
          unsubscribeCloud();
        };
      }
    });

    return () => unsubscribe();
  }, []);
  const [chats, setChats] = useState<{ id: string; title: string; messages: ChatMessage[]; pinned?: boolean }[]>(() => {
    try {
      const saved = localStorage.getItem('virul_chats');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error reading chats from localStorage:", e);
      return [];
    }
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('virul_active_chat_id');
      return saved || null;
    } catch (e) {
      return null;
    }
  });

  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [inputHeight, setInputHeight] = useState(150);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [viewportBottomOffset, setViewportBottomOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportChange = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      // Calculate how much space is covered by the soft keyboard or shifted viewport
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setViewportBottomOffset(Math.max(0, offset));
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
    
    // Check initially
    handleViewportChange();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isScrolledUp = scrollHeight - scrollTop - clientHeight > 150;
      setShowScrollDown(isScrolledUp);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (!inputContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setInputHeight(entry.target.clientHeight);
      }
    });
    observer.observe(inputContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync chats with localStorage (Sanitizing bulky base64 data to prevent QuotaExceededError crashes)
  useEffect(() => {
    try {
      const sanitizedChats = chats.map(chat => ({
        ...chat,
        messages: chat.messages.map(msg => ({
          ...msg,
          parts: msg.parts.map(part => {
            if (part.inlineData && part.inlineData.data) {
              return {
                ...part,
                inlineData: {
                  ...part.inlineData,
                  data: "" // Strip heavy raw base64 data before saving to persist only structural chat history
                }
              };
            }
            return part;
          })
        }))
      }));
      localStorage.setItem('virul_chats', JSON.stringify(sanitizedChats));
    } catch (e) {
      console.error("Error saving chats to localStorage:", e);
    }
  }, [chats]);

  // Sync activeChatId with localStorage
  useEffect(() => {
    try {
      if (activeChatId) {
        localStorage.setItem('virul_active_chat_id', activeChatId);
      } else {
        localStorage.removeItem('virul_active_chat_id');
      }
    } catch (e) {}
  }, [activeChatId]);

  // Lock document scrolling, layout bouncing, and standard mobile multi-direction elastic viewport sliding
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      let isScrollable = false;
      while (target && target !== document.body) {
        const style = window.getComputedStyle(target);
        const isScrollableY = target.scrollHeight > target.clientHeight && (style.overflowY === 'auto' || style.overflowY === 'scroll');
        const isScrollableX = target.scrollWidth > target.clientWidth && (style.overflowX === 'auto' || style.overflowX === 'scroll');
        if (isScrollableY || isScrollableX) {
          isScrollable = true;
          break;
        }
        target = target.parentElement;
      }
      if (!isScrollable) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat ? activeChat.messages : [];

  // Optimized smooth scrolling synced to the browser's paint cycles via requestAnimationFrame
  useEffect(() => {
    if (scrollRef.current) {
      const scrollEl = scrollRef.current;
      const frameId = requestAnimationFrame(() => {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [messages, statusMessage, inputHeight]);

  const handleSend = async (parts: MessagePart[], virulSearch?: boolean, virulThinks?: boolean) => {
    let currentChatId = activeChatId;

    if (!currentChatId) {
      currentChatId = crypto.randomUUID();
      const textPart = parts.find(p => p.text)?.text || '';
      const title = textPart.trim().slice(0, 35) || 'Multimodal Conversation';
      const newChat = {
        id: currentChatId,
        title: title,
        messages: []
      };
      setChats(prev => [...prev, newChat]);
      setActiveChatId(currentChatId);
    }

    const userMessage: ChatMessage = { 
      id: crypto.randomUUID(),
      role: 'user', 
      parts 
    };

    const targetChatId = currentChatId;

    setChats(prev => prev.map(c => {
      if (c.id === targetChatId) {
        const textPart = parts.find(p => p.text)?.text || '';
        const updatedTitle = (c.messages.length === 0 || c.title === 'New Topic') && textPart
          ? (textPart.trim().slice(0, 35) || c.title)
          : c.title;
        return {
          ...c,
          title: updatedTitle,
          messages: [...c.messages, userMessage]
        };
      }
      return c;
    }));

    const chatInstanceBefore = activeChatId ? chats.find(c => c.id === activeChatId) : null;
    const isNewChat = !activeChatId || !chatInstanceBefore || chatInstanceBefore.messages.length === 0 || chatInstanceBefore.title === 'New Topic';
    const textPart = parts.find(p => p.text)?.text || '';

    if (user) {
      const targetChat = chats.find(c => c.id === targetChatId) || { id: targetChatId, title: 'New Topic', messages: [] };
      const updatedTitle = (targetChat.messages.length === 0 || targetChat.title === 'New Topic') && textPart
        ? (textPart.trim().slice(0, 35) || targetChat.title)
        : targetChat.title;
      saveChatToCloud(user.uid, {
        ...targetChat,
        title: updatedTitle,
        messages: [...targetChat.messages, userMessage]
      });
    }

    if (isNewChat && textPart) {
      generateTopicTitle(textPart).then(aiTitle => {
        if (aiTitle) {
          setChats(prev => prev.map(c => {
            if (c.id === targetChatId) {
              const updated = { ...c, title: aiTitle };
              if (user) {
                saveChatToCloud(user.uid, updated);
              }
              return updated;
            }
            return c;
          }));
        }
      }).catch(err => {
        console.warn("AI Title generation error:", err);
      });
    }

    setIsLoading(true);
    setStatusMessage(virulSearch ? 'Virul is searching...' : (virulThinks ? 'Virul is deep thinking...' : 'Virul is thinking...'));

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let manuallyStopped = false;

    try {
      let fullText = '';
      let fullThought = '';
      
      const isSearch = virulSearch || parts.some(p => p.text?.toLowerCase().includes('search') || p.text?.toLowerCase().includes('who is') || p.text?.toLowerCase().includes('what is the current'));
      if (isSearch) {
        setStatusMessage('Virul is searching...');
      } else if (virulThinks) {
        setStatusMessage('Virul is deep thinking...');
      } else {
        setStatusMessage('Virul is thinking...');
      }

      const chatInstance = chats.find(c => c.id === targetChatId);
      const currentHistory = chatInstance ? chatInstance.messages : [];
      const stream = streamChat(currentHistory, parts, virulSearch, virulThinks);
      
      let hasStarted = false;
      const modelMessageId = crypto.randomUUID();

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          manuallyStopped = true;
          setStatusMessage('Virul stopped responding');
          break;
        }

        if (!hasStarted) {
          hasStarted = true;
          setStatusMessage(null);
        }
        fullText += chunk.text;
        fullThought += chunk.thought;

        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            const lastMsg = c.messages[c.messages.length - 1];
            if (lastMsg && lastMsg.id === modelMessageId) {
              return {
                ...c,
                messages: [
                  ...c.messages.slice(0, -1),
                  { ...lastMsg, parts: [{ text: fullText }], thought: fullThought }
                ]
              };
            } else {
              return {
                ...c,
                messages: [
                  ...c.messages,
                  { id: modelMessageId, role: 'model', parts: [{ text: fullText }], thought: fullThought }
                ]
              };
            }
          }
          return c;
        }));
      }

      if (user) {
        const latestChats = chatsRef.current;
        const targetChat = latestChats.find(c => c.id === targetChatId) || { id: targetChatId, title: 'New Topic', messages: [] };
        const textPart = parts.find(p => p.text)?.text || '';
        const updatedTitle = (targetChat.title === 'New Topic') && textPart
          ? (textPart.trim().slice(0, 35) || targetChat.title)
          : targetChat.title;
        saveChatToCloud(user.uid, {
          ...targetChat,
          title: updatedTitle,
          messages: [
            ...targetChat.messages,
            userMessage,
            { id: modelMessageId, role: 'model', parts: [{ text: fullText }], thought: fullThought }
          ]
        });
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        manuallyStopped = true;
        setStatusMessage('Virul stopped responding');
      } else {
        const errorMsg = error instanceof Error ? error.message : '❌ An error occurred. Please try again.';
        console.warn("Chat Error:", errorMsg);
        manuallyStopped = true;
        setStatusMessage('Virul stopped responding');
        
        const errorModelMessage: ChatMessage = { 
          id: crypto.randomUUID(),
          role: 'model', 
          parts: [{ text: errorMsg }] 
        };

        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: [...c.messages, errorModelMessage]
            };
          }
          return c;
        }));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      if (!manuallyStopped) {
        setStatusMessage(null);
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleNewChat = () => {
    handleStop();
    const newId = crypto.randomUUID();
    const newChat = {
      id: newId,
      title: 'New Topic',
      messages: [],
      pinned: false
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newId);
    setStatusMessage(null);
    if (user) {
      saveChatToCloud(user.uid, newChat);
    }
  };

  const handleRethink = () => {
    if (!activeChatId) return;
    const chatInstance = chats.find(c => c.id === activeChatId);
    if (!chatInstance) return;

    const lastUserMessage = [...chatInstance.messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          const newMessages = [...c.messages];
          if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'model') {
            newMessages.pop();
          }
          if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'user') {
            newMessages.pop();
          }
          return {
            ...c,
            messages: newMessages
          };
        }
        return c;
      }));
      handleSend(lastUserMessage.parts);
    }
  };

  return (
    <div className="fixed inset-0 flex h-screen h-[100vh] w-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-200 selection:text-blue-900 overflow-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onNewChat={handleNewChat}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onDeleteChat={(id) => {
          setChats(prev => prev.filter(c => c.id !== id));
          if (activeChatId === id) {
            setActiveChatId(null);
          }
          if (user) {
            deleteChatFromCloud(id);
          }
        }}
        onRenameChat={(id, newTitle) => {
          setChats(prev => prev.map(c => {
            if (c.id === id) {
              const updated = { ...c, title: newTitle };
              if (user) saveChatToCloud(user.uid, updated);
              return updated;
            }
            return c;
          }));
        }}
        onTogglePinChat={(id) => {
          setChats(prev => prev.map(c => {
            if (c.id === id) {
              const updated = { ...c, pinned: !c.pinned };
              if (user) saveChatToCloud(user.uid, updated);
              return updated;
            }
            return c;
          }));
        }}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        onSignInClick={() => setIsAuthModalOpen(true)}
        onSignOut={async () => {
          await signOut(auth);
          setChats([]);
          setActiveChatId(null);
        }}
      />

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />

      {/* Backdrop overlay when sidebar is open */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-slate-950/25 backdrop-blur-[2px] z-40"
          />
        )}
      </AnimatePresence>
      
      <main 
        className="flex-1 flex flex-col h-full bg-slate-50 relative overflow-hidden"
      >
        {/* Header */}
        <header className="px-4 md:px-8 py-4 flex items-center justify-between absolute top-0 left-0 right-0 bg-slate-50 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsSidebarOpen(!isSidebarOpen);
              }}
              className="p-2.5 rounded-md bg-white/50 ring-1 ring-slate-200 hover:bg-white hover:ring-slate-300 transition-all outline-none focus:outline-none flex-shrink-0 group flex items-center justify-center"
            >
              <div className="flex flex-col gap-[3px] justify-center items-center w-[13px] h-[13px]">
                <div className="w-[13px] h-[1px] bg-slate-400 group-hover:bg-slate-600 transition-colors" />
                <div className="w-[13px] h-[1px] bg-slate-400 group-hover:bg-slate-600 transition-colors" />
              </div>
            </button>
            {activeChat && activeChat.title !== 'New Topic' && (
              <span className="text-sm md:text-base font-semibold text-slate-700 max-w-[200px] sm:max-w-[320px] md:max-w-[480px] lg:max-w-[600px] truncate select-none">
                {activeChat.title}
              </span>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-hide px-4 relative z-10 scroll-smooth"
          onScroll={handleScroll}
        >
          {messages.length === 0 && (
            <div 
              className="max-w-2xl mx-auto pt-52"
              style={{ paddingBottom: `${inputHeight + 20 + viewportBottomOffset}px` }}
            >
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center justify-center text-center py-6 px-4"
              >
                <h1 
                  className="text-4xl md:text-5xl mb-3 tracking-normal"
                  style={{ 
                    fontFamily: '"Calibri", "Candara", "Segoe UI", "Optima", sans-serif', 
                    fontWeight: 300,
                    color: '#94a3b8'
                  }}
                >
                  New topic. New focus.
                </h1>
              </motion.div>
            </div>
          )}
          
          {messages.length > 0 && (
            <div 
              className="max-w-2xl mx-auto pt-24"
              style={{ paddingBottom: `${inputHeight + 20 + viewportBottomOffset}px` }}
            >

            <AnimatePresence initial={false}>
              {messages.map((m, index) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <MessageBubble 
                    message={m} 
                    isLast={index === messages.length - 1}
                    onRetry={handleRethink}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            
            <AnimatePresence>
              {(isLoading || statusMessage) && (
                <motion.div 
                  key="loading-status-ticker"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15, ease: "easeInOut" }}
                  className="flex flex-col gap-2 mb-8 overflow-hidden"
                >
                  {statusMessage && (
                    <div className="flex flex-col items-start px-4">
                      <div className="text-xs font-semibold text-blue-600 italic flex items-center gap-1.5">
                        {statusMessage}
                      </div>
                      {statusMessage === 'Virul stopped responding' && (
                        <button
                          onClick={handleRethink}
                          className="text-[11px] text-blue-600 mt-1 tracking-widest hover:underline text-left transition-colors font-bold"
                          style={{ fontFamily: '"Calibri", "Candara", "Segoe UI", "Optima", sans-serif' }}
                        >
                          Rethink
                        </button>
                      )}
                    </div>
                  )}
                  {isLoading && !messages[messages.length - 1]?.parts[0]?.text && (
                    <div className="flex gap-3 max-w-[80%] items-start px-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200/50">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="w-3 h-3 bg-blue-500 rounded-full" 
                        />
                      </div>
                      <div className="space-y-2 flex-1 pt-2">
                        <div className="h-2.5 bg-blue-100 rounded-full w-full animate-pulse"></div>
                        <div className="h-2.5 bg-blue-100 rounded-full w-2/3 animate-pulse"></div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        </div>

        {/* Floating Scroll Down Arrow Button */}
        <AnimatePresence>
          {showScrollDown && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={scrollToBottom}
              className="absolute left-1/2 -translate-x-1/2 z-45 p-2.5 rounded-full bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-center hover:text-slate-900 active:scale-95"
              style={{ bottom: `${inputHeight + 28 + viewportBottomOffset}px` }}
              title="Scroll to bottom"
              id="scroll-to-bottom-btn"
            >
              <ChevronDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div 
          ref={inputContainerRef} 
          className="absolute left-0 right-0 z-30 w-full bg-slate-50 pt-1 px-1 transition-[bottom] duration-100 ease-out"
          style={{ bottom: `${viewportBottomOffset}px` }}
        >
          <ChatInput onSend={handleSend} onStop={handleStop} disabled={isLoading} history={messages} />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-5 border border-slate-200 rounded-2xl text-left group">
      <div className="mb-4">{icon}</div>
      <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
