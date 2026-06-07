import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, CheckCircle2, AlertTriangle, Play, HelpCircle, Activity, User, Bell, MessageSquare, Users, BookOpen } from 'lucide-react';
import { Message, Quiz, Role, ChecklistItem, User as OperatorUser, Team } from '../types';

interface OperatorChatProps {
  currentUserId: string;
  currentUserRole: Role;
  currentUserChecklist?: ChecklistItem[];
  messages: Message[];
  onSendMessage: (text: string, targetOperatorId?: string) => void;
  onSubmitQuizAnswers: (quizId: string, title: string, answers: number[], score: number, total: number) => void;
  users?: OperatorUser[];
  teams?: Team[];
}

export default function OperatorChat({
  currentUserId,
  currentUserRole,
  currentUserChecklist = [],
  messages = [],
  onSendMessage,
  onSubmitQuizAnswers,
  users = [],
  teams = [],
}: OperatorChatProps) {
  const [typedMessage, setTypedMessage] = useState('');
  
  // Tracking answers for active quizzes: key is quizId, value is list of selected indices
  const [activeQuizAnswers, setActiveQuizAnswers] = useState<Record<string, number[]>>({});

  // Active notifications state
  const [newNotification, setNewNotification] = useState<string | null>(null);

  // Today's checklist state
  const [checklistItems, setChecklistItems] = useState<{ id: string; label: string; desc: string; checked: boolean; }[]>([]);

  // Track scroll position of chat END
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Resolve teammate list and supervisors based on active team matching
  const myTeam = useMemo(() => {
    return teams.find(t => t.operatorIds.includes(currentUserId));
  }, [teams, currentUserId]);

  const conversationPartners = useMemo(() => {
    // Teammate operators (or other operators if no team active)
    const operators = myTeam
      ? users.filter(u => u.role === 'OPERATOR' && u.id !== currentUserId && myTeam.operatorIds.includes(u.id))
      : users.filter(u => u.role === 'OPERATOR' && u.id !== currentUserId);

    // supervisors & managers
    const supervisors = users.filter(u => u.role === 'SUPERVISOR' || u.role === 'MANAGER');

    return { operators, supervisors };
  }, [users, currentUserId, myTeam]);

  // Selected active channel in the left sidebar: defaults to 'group-chat'
  const [activeChannelId, setActiveChannelId] = useState<string>('group-chat');

  // Track last read timestamps to count unread messages dynamically
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, string>>({
    'group-chat': new Date().toISOString()
  });

  // Filter messages based on active selected channel
  const activeRoomMessages = useMemo(() => {
    if (activeChannelId === 'group-chat') {
      return messages.filter(m => {
        // Group Chat handles messages without a specific target, or targeting the team group id, or general target
        const groupTargetId = myTeam ? `group-${myTeam.id}` : 'group-general';
        return !m.targetOperatorId || m.targetOperatorId === groupTargetId || m.targetOperatorId === 'group-chat';
      });
    } else {
      // Direct Message Room between logged-in operator and the selected conversation partner
      return messages.filter(m => {
        return (m.senderId === activeChannelId && m.targetOperatorId === currentUserId) ||
               (m.senderId === currentUserId && m.targetOperatorId === activeChannelId);
      });
    }
  }, [messages, activeChannelId, currentUserId, myTeam]);

  // Track messages length cleanly to dispatch warning/notifications loop-free
  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.senderId !== currentUserId) {
        // Only trigger alerts for messages that would show in the active channel OR that are private messages specifically for me
        const belongsToActive = activeChannelId === 'group-chat' 
          ? (!lastMsg.targetOperatorId || lastMsg.targetOperatorId.startsWith('group-') || lastMsg.targetOperatorId === 'group-chat')
          : (lastMsg.senderId === activeChannelId && lastMsg.targetOperatorId === currentUserId);

        const isGroupMsg = !lastMsg.targetOperatorId || lastMsg.targetOperatorId.startsWith('group-') || lastMsg.targetOperatorId === 'group-chat';
        const isTargetedToMe = lastMsg.targetOperatorId === currentUserId;

        if (belongsToActive || isTargetedToMe) {
          setNewNotification(`New message from ${lastMsg.senderName}: "${lastMsg.content.slice(0, 45)}${lastMsg.content.length > 45 ? '...' : ''}"`);
        }
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, currentUserId, activeChannelId]);

  // Initialize checklist items
  useEffect(() => {
    if (currentUserChecklist && currentUserChecklist.length > 0) {
      setChecklistItems(currentUserChecklist.map(item => ({
        id: item.id,
        label: item.label,
        desc: item.desc,
        checked: false // reset to unchecked for each shift start
      })));
    } else {
      setChecklistItems([]);
    }
  }, [currentUserChecklist]);

  // Track timestamps updates on selection
  useEffect(() => {
    setLastReadTimestamps(prev => ({
      ...prev,
      [activeChannelId]: new Date().toISOString()
    }));
  }, [activeChannelId, messages.length]);

  // Scroll active thread automatically
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeRoomMessages.length]);

  const handleToggleCheck = (id: string) => {
    setChecklistItems(prev =>
      prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const handleSendChecklist = () => {
    const completed = checklistItems.filter(item => item.checked).map(item => `✅ ${item.label}`);
    const pending = checklistItems.filter(item => !item.checked).map(item => `❌ ${item.label}`);

    let content = `📋 TODAY'S COMPLIANCE CHECKLIST REPORT:\n\n`;
    if (completed.length > 0) {
      content += `COMPLETED TASKS:\n${completed.join('\n')}\n\n`;
    }
    if (pending.length > 0) {
      content += `PENDING TASKS:\n${pending.join('\n')}`;
    }

    onSendMessage(content);
    setNewNotification("Checklist status report submitted to team channel!");
  };

  const handleSend = () => {
    if (!typedMessage.trim()) return;
    
    if (activeChannelId === 'group-chat') {
      const groupTargetId = myTeam ? `group-${myTeam.id}` : 'group-general';
      onSendMessage(typedMessage, groupTargetId);
    } else {
      onSendMessage(typedMessage, activeChannelId);
    }
    
    setTypedMessage('');
  };

  const handleQuizOptionSelect = (quizId: string, qIdx: number, oIdx: number) => {
    setActiveQuizAnswers(prev => {
      const current = [ ...(prev[quizId] || []) ];
      current[qIdx] = oIdx;
      return {
        ...prev,
        [quizId]: current
      };
    });
  };

  const submitQuiz = async (quiz: Quiz) => {
    const answersList = activeQuizAnswers[quiz.id] || [];
    
    if (answersList.filter(v => v !== undefined && v !== -1).length < quiz.questions.length) {
      alert("Please solve all quiz questions before submitting.");
      return;
    }

    // Calculate score
    let score = 0;
    quiz.questions.forEach((q, idx) => {
      if (answersList[idx] === q.correctOption) {
        score += 1;
      }
    });

    onSubmitQuizAnswers(quiz.id, quiz.title, answersList, score, quiz.questions.length);
    
    // Clear selections local state
    setActiveQuizAnswers(prev => {
      const copy = { ...prev };
      delete copy[quiz.id];
      return copy;
    });

    setNewNotification(`Quiz compiled: safety quiz scorecard passed to logs! Score: ${score}/${quiz.questions.length}`);
  };

  // Helper unread indicator calculations
  const getUnreadCount = (targetId: string) => {
    if (activeChannelId === targetId) return 0;
    const lastRead = lastReadTimestamps[targetId];
    
    const relevantMsgs = targetId === 'group-chat'
      ? messages.filter(m => !m.targetOperatorId || m.targetOperatorId.startsWith('group-') || m.targetOperatorId === 'group-chat')
      : messages.filter(m => m.senderId === targetId && m.targetOperatorId === currentUserId);

    if (!lastRead) return relevantMsgs.length;
    return relevantMsgs.filter(m => new Date(m.createdAt) > new Date(lastRead)).length;
  };

  const getChannelPreviewMsg = (targetId: string) => {
    const relevantMsgs = targetId === 'group-chat'
      ? messages.filter(m => !m.targetOperatorId || m.targetOperatorId.startsWith('group-') || m.targetOperatorId === 'group-chat')
      : messages.filter(m => (m.senderId === targetId && m.targetOperatorId === currentUserId) || (m.senderId === currentUserId && m.targetOperatorId === targetId));

    if (relevantMsgs.length === 0) return 'No conversation logs';
    return relevantMsgs[relevantMsgs.length - 1].content;
  };

  const getChannelPreviewTime = (targetId: string) => {
    const relevantMsgs = targetId === 'group-chat'
      ? messages.filter(m => !m.targetOperatorId || m.targetOperatorId.startsWith('group-') || m.targetOperatorId === 'group-chat')
      : messages.filter(m => (m.senderId === targetId && m.targetOperatorId === currentUserId) || (m.senderId === currentUserId && m.targetOperatorId === targetId));

    if (relevantMsgs.length === 0) return '';
    const last = relevantMsgs[relevantMsgs.length - 1];
    return new Date(last.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const channelTitle = useMemo(() => {
    if (activeChannelId === 'group-chat') {
      return myTeam ? `Group Chat: ${myTeam.name}` : 'Team Group Chat';
    } else {
      const partner = users.find(u => u.id === activeChannelId);
      return partner ? `${partner.name} (${partner.role})` : 'Private Chat';
    }
  }, [activeChannelId, myTeam, users]);

  const activePartner = users.find(u => u.id === activeChannelId);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 bg-[#090909] border border-[#262626] rounded-xl overflow-hidden h-[580px] shadow-2xl relative">
      
      {/* LEFT COLUMN: CONTACT CHANNELS & CHECKLIST SIDEBAR (width: 4/12) */}
      <div className="md:col-span-4 border-r border-[#262626] bg-[#111] flex flex-col justify-between h-full overflow-hidden">
        
        {/* Chats lists Scrollable container */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-[#262626] flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-[#ededed] font-bold block">
              Comms Channels
            </span>
            <span className="text-[9px] bg-emerald-950/20 border border-emerald-900/40 px-2 py-0.5 rounded text-emerald-450 font-mono font-bold uppercase animate-pulse">
              Grid Sinking ACTIVE
            </span>
          </div>

          <div className="divide-y divide-[#181818]">
            {/* 1. Dynamic Team Group Chat Card */}
            <div 
              onClick={() => setActiveChannelId('group-chat')}
              className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-all duration-150 select-none ${
                activeChannelId === 'group-chat' 
                  ? 'bg-amber-500/10 border-l-2 border-amber-500' 
                  : 'hover:bg-zinc-900/45 bg-transparent'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-sans font-bold text-xs text-amber-500 truncate block">
                      {myTeam ? `${myTeam.name}` : 'General Stations Chat'}
                    </span>
                    <span className="text-[9.5px] font-mono text-zinc-650">
                      {getChannelPreviewTime('group-chat')}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-zinc-500 truncate font-sans mt-0.5">
                    {getChannelPreviewMsg('group-chat')}
                  </p>
                </div>
              </div>

              {getUnreadCount('group-chat') > 0 && (
                <span className="w-4.5 h-4.5 bg-red-650 border border-red-500 font-mono text-[10px] text-white font-bold flex justify-center items-center rounded-full shrink-0">
                  {getUnreadCount('group-chat')}
                </span>
              )}
            </div>

            {/* 2. Chiefs and managers */}
            {conversationPartners.supervisors.map(chef => {
              const isActive = activeChannelId === chef.id;
              const unread = getUnreadCount(chef.id);
              const preview = getChannelPreviewMsg(chef.id);
              const lastTime = getChannelPreviewTime(chef.id);

              return (
                <div 
                  key={chef.id}
                  onClick={() => setActiveChannelId(chef.id)}
                  className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-all duration-150 select-none ${
                    isActive 
                      ? 'bg-amber-950/20 border-l-2 border-amber-500' 
                      : 'hover:bg-zinc-900/41 bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <img 
                        src={chef.avatar} 
                        alt={chef.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-md object-cover border border-[#222]" 
                      />
                      <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-black ${
                        chef.isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-sans font-bold text-xs text-zinc-150 truncate block">
                          {chef.name}
                        </span>
                        <span className="text-[9.5px] font-mono text-zinc-650">
                          {lastTime}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-violet-400 font-medium tracking-wide block leading-none">
                        {chef.role}
                      </span>
                      <p className="text-[10.5px] text-zinc-500 truncate font-sans mt-0.5">
                        {preview}
                      </p>
                    </div>
                  </div>

                  {unread > 0 && (
                    <span className="w-4.5 h-4.5 bg-red-650 border border-red-500 font-mono text-[10px] text-white font-bold flex justify-center items-center rounded-full shrink-0">
                      {unread}
                    </span>
                  )}
                </div>
              );
            })}

            {/* 3. Teammates */}
            {conversationPartners.operators.map(teammate => {
              const isActive = activeChannelId === teammate.id;
              const unread = getUnreadCount(teammate.id);
              const preview = getChannelPreviewMsg(teammate.id);
              const lastTime = getChannelPreviewTime(teammate.id);

              return (
                <div 
                  key={teammate.id}
                  onClick={() => setActiveChannelId(teammate.id)}
                  className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-all duration-150 select-none ${
                    isActive 
                      ? 'bg-amber-950/20 border-l-2 border-amber-500' 
                      : 'hover:bg-zinc-900/41 bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <img 
                        src={teammate.avatar} 
                        alt={teammate.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-md object-cover border border-[#222]" 
                      />
                      <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-black ${
                        teammate.isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-sans font-bold text-xs text-[#ededed] truncate block">
                          {teammate.name}
                        </span>
                        <span className="text-[9.5px] font-mono text-zinc-650">
                          {lastTime}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-zinc-500 truncate font-sans mt-0.5">
                        {preview}
                      </p>
                    </div>
                  </div>

                  {unread > 0 && (
                    <span className="w-4.5 h-4.5 bg-red-650 border border-red-500 font-mono text-[10px] text-white font-bold flex justify-center items-center rounded-full shrink-0">
                      {unread}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CHEKLIST WIDGET AT BOTTOM OF LEFT SIDEBAR */}
        <div className="p-4 border-t border-[#262626] bg-[#0c0c0c] shrink-0">
          <h4 className="font-mono text-[10.5px] uppercase tracking-wider text-[#ededed] mb-2.5 flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
            Shift Action Checklist
          </h4>
          
          <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 mb-2.5">
            {checklistItems.map(item => (
              <div key={item.id} className="flex items-start gap-2 check-item">
                <input 
                  type="checkbox" 
                  checked={item.checked} 
                  onChange={() => handleToggleCheck(item.id)}
                  className="mt-0.5 accent-amber-500 h-3.5 w-3.5 border-zinc-750 bg-black rounded cursor-pointer" 
                />
                <div>
                  <span className="text-[11px] font-sans font-medium text-zinc-150 block leading-tight">{item.label}</span>
                  <span className="text-[9px] text-zinc-500 block leading-tight mt-0.5">{item.desc}</span>
                </div>
              </div>
            ))}
            {checklistItems.length === 0 && (
              <span className="text-[10px] font-sans text-neutral-500 italic block py-4 text-center border-dashed border border-[#202020] rounded">
                No supervisor checklist assigned yet.
              </span>
            )}
          </div>

          <button
            id="btn-send-checklist-sidebar"
            onClick={handleSendChecklist}
            disabled={checklistItems.length === 0}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-semibold rounded text-[10.5px] transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-2.5 h-2.5" />
            Send Shift Checklist STATUS
          </button>
        </div>

      </div>

      {/* RIGHT COLUMN: ACTIVE CONVERSATION MESSAGES AND THREAD (width: 8/12) */}
      <div className="md:col-span-8 bg-[#0a0a0a] flex flex-col justify-between h-full overflow-hidden">
        
        {/* Header summary of active room */}
        <div className="p-4 bg-[#111] border-b border-[#262626] flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            {activeChannelId === 'group-chat' ? (
              <div className="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Users className="w-4.5 h-4.5" />
              </div>
            ) : (
              <img 
                src={activePartner?.avatar} 
                alt={activePartner?.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded object-cover border border-[#222]" 
              />
            )}
            <div>
              <span className="font-sans font-bold text-xs text-[#ededed] block">
                {channelTitle}
              </span>
              <p className="text-[9.5px] font-mono text-zinc-550 leading-none mt-0.5">
                {activeChannelId === 'group-chat' ? "Syncing Multioperator Broadcast Grid" : `Direct Secure Tunnel: ${activePartner?.role}`}
              </p>
            </div>
          </div>

          <span className="flex items-center gap-1.5 text-[10.5px] text-[#888] font-mono">
            <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            Live Tunnel Active
          </span>
        </div>

        {/* Global Alert Notification Toast */}
        {newNotification && (
          <div className="bg-amber-950/45 border-b border-amber-900/60 px-4 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0">
            <span className="font-sans flex items-center gap-1.5 min-w-0 flex-1">
              <Bell className="w-4 h-4 text-amber-500 shrink-0 animate-bounce" />
              <span className="truncate">{newNotification}</span>
            </span>
            <button 
              onClick={() => setNewNotification(null)} 
              className="text-[9.5px] font-mono uppercase tracking-wider text-amber-500 hover:text-white px-1.5 py-0.5 rounded border border-amber-900/30 hover:border-amber-950 bg-black cursor-pointer shrink-0 ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* MESSAGES LOG CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[380px]">
          {activeRoomMessages.map((msg) => {
            const isSelf = msg.senderId === currentUserId;
            const isSupervisor = msg.senderRole === 'SUPERVISOR';
            const isSystemAlert = msg.isAlert;

            return (
              <div 
                key={msg.id}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} space-y-1`}
              >
                {/* Header credentials */}
                <div className="flex items-center gap-2 px-1 text-[10px] text-zinc-500 font-mono">
                  <span className={isSelf ? 'text-amber-500' : isSupervisor ? 'text-violet-400 font-bold' : 'text-zinc-350'}>
                    {msg.senderName}
                  </span>
                  <span>•</span>
                  <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Content Bubble */}
                <div 
                  className={`max-w-[75%] rounded-lg p-3 ${
                    isSystemAlert 
                      ? 'bg-red-950/20 border border-red-900/30 text-rose-200'
                      : isSelf
                        ? 'bg-amber-950/20 border border-amber-500/35 text-amber-100 font-sans'
                        : isSupervisor
                          ? 'bg-[#121212] border border-[#222] text-zinc-150 font-sans shadow'
                          : 'bg-[#161616] border border-[#262626] text-zinc-200 font-sans'
                  }`}
                >
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {/* Render Quiz Score Card if attached */}
                  {msg.quizScore && (
                    <div className="mt-3 bg-[#0a0a0a] border border-[#262626] rounded p-2 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-emerald-500/10 flex items-center justify-center border border-emerald-900/30">
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[9px] text-emerald-400 font-bold block leading-none">
                          COMPLIANCE SCORE LOGGED
                        </span>
                        <span className="text-[10px] text-zinc-350 block mt-1">
                          Score: {msg.quizScore.score}/{msg.quizScore.total} Correct (
                          {Math.round((msg.quizScore.score / msg.quizScore.total) * 100)}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Real-time Inline Practice Quiz Form rendering */}
                {msg.quiz && msg.quiz.status === 'PENDING' && currentUserRole === 'OPERATOR' && (
                  <div className="w-full max-w-[85%] bg-black/50 border border-[#222] rounded-lg p-3.5 mt-2.5 backdrop-blur shadow-xl">
                    <div className="flex items-center justify-between border-b border-[#202020] pb-2 mb-3">
                      <div className="flex items-center gap-1.5">
                        <Play className="w-4 h-4 text-amber-500 animate-pulse" />
                        <h4 className="font-mono text-xs text-yellow-500 font-bold uppercase tracking-wider">
                          {msg.quiz.title}
                        </h4>
                      </div>
                      <span className="bg-yellow-950/20 border border-yellow-900/40 text-yellow-500 font-mono text-[8px] px-1.5 py-0.5 rounded font-bold uppercase animate-pulse">
                        Pending Grade
                      </span>
                    </div>

                    <div className="space-y-4">
                      {msg.quiz.questions.map((q, qIndex) => {
                        const answers = activeQuizAnswers[msg.quiz!.id] || [];
                        const selectedVal = answers[qIndex];
                        
                        return (
                          <div key={q.id} className="border-b border-[#1c1c1c] pb-2.5 last:border-0 last:pb-0">
                            <p className="text-[11.5px] text-[#ededed] font-sans font-medium mb-1.5 flex gap-1.5">
                              <span className="font-mono text-amber-500">{qIndex + 1}.</span>
                              {q.question}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                              {q.options.map((option, oIdx) => {
                                const isSelected = selectedVal === oIdx;
                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    onClick={() => handleQuizOptionSelect(msg.quiz!.id, qIndex, oIdx)}
                                    className={`text-left p-2 rounded border text-[11px] font-sans transition-all duration-150 cursor-pointer ${
                                      isSelected
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/50'
                                        : 'bg-zinc-950/40 text-zinc-500 border-[#1c1c1c] hover:bg-[#111] hover:text-[#ededed]'
                                    }`}
                                  >
                                    <span className="font-mono font-bold mr-1">{String.fromCharCode(65 + oIdx)}.</span>{' '}
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3.5 pt-2 border-t border-[#1c1c1c] flex justify-end">
                      <button
                        type="button"
                        onClick={() => submitQuiz(msg.quiz!)}
                        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-[10.5px] px-3.5 py-1.5 rounded transition-all cursor-pointer border-none shadow active:scale-[0.97]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Log Answers & Post Score
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {activeRoomMessages.length === 0 && (
            <div className="text-center py-20 flex flex-col items-center justify-center text-zinc-650">
              <span className="text-xs italic font-sans block">
                No matching chat messages in this secure operator thread.
              </span>
              <p className="text-[10px] font-mono text-zinc-700 mt-1">
                Enter your shift logs below to establish direct tunnel communication.
              </p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* INPUT MESSAGE SINK AREA bar */}
        <div className="p-3 bg-[#111] border-t border-[#262626] flex items-center gap-2 shrink-0">
          <input
            id="inp-chat-message"
            type="text"
            value={typedMessage}
            onChange={(e) => setTypedMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={activeChannelId === 'group-chat' ? "Broadcast message to Team Comms..." : `Type secure direct message to conversation...`}
            className="flex-1 bg-[#050505] text-[#ededed] placeholder-[#444] rounded border border-[#222] px-3.5 py-2 text-xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
          <button
            id="btn-chat-send"
            onClick={handleSend}
            className="p-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded cursor-pointer duration-150"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

      </div>

    </div>
  );
}
