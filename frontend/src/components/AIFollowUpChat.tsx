/**
 * AIFollowUpChat — Reusable follow-up chat component for AI analysis.
 *
 * Can be embedded in any panel that has a session context.
 * Sends questions to the AI follow-up endpoint and displays conversation history.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Loader2, MessageSquare, Brain } from 'lucide-react';
import { GlassButton } from './ui/GlassUI';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIFollowUpChatProps {
  sessionId: string;
  compact?: boolean;
}

export default function AIFollowUpChat({ sessionId, compact = false }: AIFollowUpChatProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setHistory(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const resp = await fetch(`/api/test-sessions/${sessionId}/ai-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          conversation_history: history,
        }),
      });
      const data = await resp.json();
      if (data.answer) {
        setHistory(prev => [...prev, { role: 'assistant', content: data.answer }]);
      } else {
        setHistory(prev => [...prev, { role: 'assistant', content: data.error || 'No response received.' }]);
      }
    } catch {
      setHistory(prev => [...prev, { role: 'assistant', content: 'Failed to get response. Check connection.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, history, sessionId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
      {/* Header */}
      {!compact && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'rgba(255,255,255,0.5)',
        }}>
          <MessageSquare size={12} />
          Follow-up Questions
        </div>
      )}

      {/* Conversation history */}
      {history.length > 0 && (
        <div
          ref={scrollRef}
          style={{
            maxHeight: compact ? 200 : 300,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {history.map((msg, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.5,
                background: msg.role === 'user'
                  ? 'rgba(255,140,0,0.1)'
                  : 'rgba(6,182,212,0.08)',
                borderLeft: `2px solid ${msg.role === 'user' ? '#ff8c00' : '#06b6d4'}`,
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              <div style={{
                fontSize: 9,
                color: msg.role === 'user' ? '#ff8c00' : '#06b6d4',
                marginBottom: 3,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                {msg.role === 'user' ? 'You' : 'AI'}
              </div>
              {msg.content}
            </div>
          ))}
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: 'rgba(255,255,255,0.5)',
              padding: '6px 10px',
            }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              Thinking...
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && !compact && (
        <div style={{
          padding: 12, textAlign: 'center',
          fontSize: 11, color: 'rgba(255,255,255,0.4)',
        }}>
          <Brain size={20} style={{ margin: '0 auto 6px', opacity: 0.3 }} />
          Ask questions about this session's analysis
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={compact ? "Ask about this engagement..." : "Ask a follow-up question..."}
          style={{
            flex: 1,
            padding: '6px 10px',
            fontSize: 11,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: '#fff',
            outline: 'none',
          }}
        />
        <GlassButton
          variant="primary"
          size="sm"
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          <Send size={12} />
        </GlassButton>
      </div>
    </div>
  );
}
