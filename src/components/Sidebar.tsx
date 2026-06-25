import React, { useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, X, Star, Edit2, Check, MoreVertical, Trash2, LogIn, LogOut } from 'lucide-react';
import { ChatMessage } from '../services/geminiService';

interface SidebarProps {
  onNewChat: () => void;
  isOpen: boolean;
  chats: { id: string; title: string; messages: ChatMessage[]; pinned?: boolean }[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  onClose: () => void;
  user: any | null;
  onSignInClick: () => void;
  onSignOut: () => void;
}

export default function Sidebar({ 
  onNewChat, 
  isOpen, 
  chats, 
  activeChatId, 
  onSelectChat, 
  onDeleteChat, 
  onRenameChat, 
  onTogglePinChat, 
  onClose,
  user,
  onSignInClick,
  onSignOut
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [activeDropdownChatId, setActiveDropdownChatId] = useState<string | null>(null);

  const sortedChats = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = chats.filter(c => 
      !query ||
      c.title.toLowerCase().includes(query) ||
      c.messages.some(m => m.parts.some(p => p.text?.toLowerCase().includes(query)))
    );

    return [...filtered].sort((a, b) => {
      const aPinned = a.pinned ? 1 : 0;
      const bPinned = b.pinned ? 1 : 0;
      return bPinned - aPinned;
    });
  }, [chats, searchQuery]);

  const handleSelect = (id: string) => {
    onSelectChat(id);
    onClose();
  };

  const handleNewTopic = () => {
    onNewChat();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="sidebar"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="fixed top-0 left-0 h-screen w-full sm:max-w-md bg-[#f8fafc]/98 backdrop-blur-md flex flex-col overflow-hidden z-50 border-r border-slate-200/80 shadow-2xl"
        >
          <div className="flex-1 flex flex-col w-full px-6 py-8 h-full bg-transparent">
            {/* Topic Storage Header Row */}
            <div className="flex items-center justify-between mb-5 flex-shrink-0">
              <div className="flex flex-col">
                <h2 className="text-4xl font-bold text-slate-800 tracking-tight" style={{ fontFamily: '"Calibri", "Candara", "Segoe UI", "Optima", sans-serif' }}>
                  Topics
                </h2>
              </div>
            </div>
            {/* Search Input borderless and transparent, moved to the left */}
            <div className="relative mb-2 flex-shrink-0">
              <div className="flex items-center gap-2 pb-1 transition-all">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => {
                    // Small delay to let selection click resolve
                    setTimeout(() => setIsSearchFocused(false), 200);
                  }}
                  placeholder="Search for a Topic" 
                  className="w-full bg-transparent py-1 text-lg font-bold text-slate-600 focus:outline-none placeholder:text-slate-600 placeholder:font-bold not-italic placeholder:not-italic transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* New Topic Button borderless, transparent, left-aligned, larger text (hidden when searching) */}
            {!(isSearchFocused || searchQuery) && (
              <div className="flex justify-start mb-3 flex-shrink-0 -mt-1">
                <button
                  onClick={handleNewTopic}
                  className="flex items-center py-1 bg-transparent text-lg font-bold text-slate-600 hover:text-blue-600 transition-all outline-none focus:outline-none cursor-pointer self-start"
                >
                  <span>New topic</span>
                </button>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto px-1 scrollbar-hide">
              <div className="space-y-1.5">
                 {sortedChats.map((chat) => {
                   return (
                     <div
                       key={chat.id}
                       onClick={() => handleSelect(chat.id)}
                       className={cn(
                         "group flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-bold transition-all cursor-pointer relative",
                         chat.id === activeChatId
                           ? "bg-slate-200/70 text-slate-800 border-transparent"
                           : "text-slate-500 hover:bg-slate-200/30 hover:text-slate-700 border border-transparent"
                       )}
                     >
                       {editingChatId === chat.id ? (
                         <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
                           <input
                             type="text"
                             value={editTitle}
                             onChange={(e) => setEditTitle(e.target.value)}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter') {
                                 const trimmed = editTitle.trim();
                                 if (trimmed) onRenameChat(chat.id, trimmed);
                                 setEditingChatId(null);
                               } else if (e.key === 'Escape') {
                                 setEditingChatId(null);
                               }
                             }}
                             className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-700 flex-1 focus:outline-none focus:ring-0 focus:border-slate-400"
                             style={{ fontFamily: '"Calibri", "Candara", "Segoe UI", "Optima", sans-serif' }}
                             autoFocus
                           />
                           <button
                             onClick={() => {
                               const trimmed = editTitle.trim();
                               if (trimmed) onRenameChat(chat.id, trimmed);
                               setEditingChatId(null);
                             }}
                             className={cn(
                               "p-1 hover:bg-slate-200 rounded focus:outline-none transition-colors",
                               editTitle.trim() !== chat.title.trim() ? "text-green-600" : "text-slate-400"
                             )}
                             title="Save"
                           >
                             <Check size={12} strokeWidth={2.5} />
                           </button>
                           <button
                             onClick={() => setEditingChatId(null)}
                             className="p-1 hover:bg-slate-200 rounded text-slate-400 focus:outline-none"
                             title="Cancel"
                           >
                             <X size={12} strokeWidth={2.5} />
                           </button>
                         </div>
                       ) : (
                         <>
                           <span 
                             className="min-w-0 truncate pr-1"
                             style={{ 
                               fontFamily: '"Calibri", "Candara", "Segoe UI", "Optima", sans-serif', 
                               color: chat.id === activeChatId ? '#334155' : '#64748b'
                             }}
                           >
                             {chat.title}
                           </span>
                           {chat.pinned && (
                             <span 
                               className="text-xs text-slate-400 font-light italic shrink-0 select-none ml-2"
                               style={{ fontFamily: '"Calibri", "Candara", "Segoe UI", "Optima", sans-serif' }}
                             >
                               starred
                              </span>
                           )}
                           <div className="flex-1" />

                           <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto pl-2">






                             {/* Options Dropdown Trigger */}
                             <div className="relative" onClick={(e) => e.stopPropagation()}>
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setActiveDropdownChatId(activeDropdownChatId === chat.id ? null : chat.id);
                                 }}
                                 className={cn(
                                   "p-1 rounded hover:bg-slate-200 transition-all focus:outline-none flex items-center justify-center",
                                   activeDropdownChatId === chat.id 
                                     ? "text-slate-600 bg-slate-200" 
                                     : "opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-950"
                                 )}
                                 title="Options"
                               >
                                 <MoreVertical size={13} strokeWidth={2.5} />
                               </button>

                               {/* Dropdown Menu */}
                               <AnimatePresence>
                                 {activeDropdownChatId === chat.id && (
                                   <>
                                     <div 
                                       className="fixed inset-0 z-30 cursor-default"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         setActiveDropdownChatId(null);
                                       }}
                                     />
                                     <motion.div
                                       initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                       animate={{ opacity: 1, scale: 1, y: 0 }}
                                       exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                       transition={{ duration: 0.1 }}
                                       className="absolute right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-md py-1 w-32 z-40 text-slate-700 font-bold flex flex-col text-xs"
                                     >
                                       <button
                                         onClick={() => {
                                           onTogglePinChat(chat.id);
                                           setActiveDropdownChatId(null);
                                         }}
                                         className="px-3 py-2 hover:bg-slate-50 transition-all text-left w-full text-slate-600 hover:text-blue-600 font-sans"
                                       >
                                         
                                         <span>{chat.pinned ? "Unstar" : "Star"}</span>
                                       </button>

                                       <button
                                         onClick={() => {
                                           setEditingChatId(chat.id);
                                           setEditTitle(chat.title);
                                           setActiveDropdownChatId(null);
                                         }}
                                         className="px-3 py-2 hover:bg-slate-50 transition-all text-left w-full text-slate-600 hover:text-slate-950 font-sans"
                                       >
                                         
                                         <span>Rename</span>
                                       </button>

                                       <button
                                         onClick={() => {
                                           onDeleteChat(chat.id);
                                           setActiveDropdownChatId(null);
                                         }}
                                         className="px-3 py-2 hover:bg-slate-50 transition-all text-left w-full text-slate-600 hover:text-slate-950 font-sans"
                                       >
                                         
                                         <span>Delete</span>
                                       </button>
                                     </motion.div>
                                   </>
                                 )}
                               </AnimatePresence>
                             </div>
                           </div>
                         </>
                       )}
                     </div>
                   );
                 })}
                 {sortedChats.length === 0 && (
                   <div className="text-center text-xs font-bold text-slate-400/80 py-8 italic">
                     {(isSearchFocused || searchQuery) ? "no matching topics" : "No topics yet"}
                   </div>
                 )}
              </div>
            </nav>

            {/* Account Panel */}
            <div className="mt-2 flex flex-col gap-2 flex-shrink-0 mb-2">
              {user ? (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold select-none shadow-sm flex-shrink-0">
                      {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : (user.email ? user.email.slice(0, 2).toUpperCase() : 'US')}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-slate-700 truncate">
                        {user.displayName || 'User Account'}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 truncate font-sans">
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={onSignOut}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                    title="Sign Out"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={onSignInClick}
                  className="w-full py-3.5 border border-solid border-slate-200 hover:border-slate-300 hover:bg-slate-100/50 text-slate-700 hover:text-slate-800 font-semibold rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Sign in</span>
                </button>
              )}
            </div>

            {/* Close Button at the bottom of Topics list */}
            <div className="mt-4 pt-1 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-lg text-sm transition-all focus:outline-none focus:ring-0 cursor-pointer active:scale-[0.98]"
              >
                Close
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
