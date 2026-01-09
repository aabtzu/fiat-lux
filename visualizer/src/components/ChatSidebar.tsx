'use client';

import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSidebarProps {
  fileId: string;
  onVisualizationUpdate: (html: string) => void;
  currentVisualization: string;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  abortControllerRef: MutableRefObject<AbortController | null>;
  onCancel: () => void;
  pendingMessage?: string | null;
  onPendingMessageHandled?: () => void;
}

export default function ChatSidebar({
  fileId,
  onVisualizationUpdate,
  currentVisualization,
  isLoading,
  setIsLoading,
  abortControllerRef,
  onCancel,
  pendingMessage,
  onPendingMessageHandled,
}: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save state whenever visualization or messages change
  const saveState = useCallback(async (viz: string, msgs: Message[]) => {
    try {
      await fetch(`/api/files/${fileId}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visualization: viz,
          chatHistory: msgs,
        }),
      });
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }, [fileId]);

  // Load saved state or generate initial visualization
  useEffect(() => {
    if (hasInitialized) return;
    setHasInitialized(true);

    const loadOrGenerate = async () => {
      setIsLoading(true);

      try {
        // Try to load saved state first
        const stateResponse = await fetch(`/api/files/${fileId}/state`);
        if (stateResponse.ok) {
          const state = await stateResponse.json();

          if (state.visualization) {
            // Use saved state
            onVisualizationUpdate(state.visualization);
            setMessages(state.chatHistory || []);
            setIsLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error('Error loading saved state:', error);
      }

      // No saved state, generate initial visualization
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId,
            message: 'Create an initial visualization for this document. Make it clear, informative, and visually appealing.',
            history: [],
            currentVisualization: '',
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error('Failed to generate visualization');

        const data = await response.json();
        const initialMessages: Message[] = [
          {
            role: 'assistant',
            content: data.message || 'Created an initial visualization. How would you like me to modify it?',
          },
        ];

        onVisualizationUpdate(data.visualization);
        setMessages(initialMessages);

        // Save the initial state
        await saveState(data.visualization, initialMessages);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setMessages([
            {
              role: 'assistant',
              content: 'Generation cancelled. Describe how you\'d like to visualize your data.',
            },
          ]);
        } else {
          console.error('Error generating initial visualization:', error);
          setMessages([
            {
              role: 'assistant',
              content: 'I had trouble generating the initial visualization. Please describe how you\'d like to see your data displayed.',
            },
          ]);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    };

    loadOrGenerate();
  }, [hasInitialized, fileId, onVisualizationUpdate, saveState, setIsLoading, abortControllerRef]);

  const sendMessageWithContent = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          message: userMessage,
          history: messages,
          currentVisualization,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to update visualization');

      const data = await response.json();
      const updatedMessages: Message[] = [
        ...newMessages,
        { role: 'assistant', content: data.message || 'Updated the visualization.' },
      ];

      // Only update visualization if one was returned (null means question-only response)
      if (data.visualization) {
        onVisualizationUpdate(data.visualization);
        await saveState(data.visualization, updatedMessages);
      } else {
        // For question-only responses, save just the messages with current visualization
        await saveState(currentVisualization, updatedMessages);
      }
      setMessages(updatedMessages);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Cancelled. What would you like to do instead?' },
        ]);
      } else {
        console.error('Error:', error);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Sorry, I had trouble updating the visualization. Please try again.' },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput('');
    await sendMessageWithContent(userMessage);
  };

  // Handle pending messages (e.g., from file uploads)
  useEffect(() => {
    if (pendingMessage && !isLoading && hasInitialized) {
      sendMessageWithContent(pendingMessage);
      onPendingMessageHandled?.();
    }
  }, [pendingMessage, isLoading, hasInitialized]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-medium text-gray-800">Chat</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {isLoading ? 'Press ESC to cancel' : 'Ask questions or refine the visualization'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-100 text-gray-900 px-5 py-3'
                  : 'bg-gray-100 text-gray-800 px-4 py-3'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
              <span className="inline-flex gap-1">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
              </span>
              <button
                onClick={handleCancel}
                className="ml-2 text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., How many hours of classes? Make it more colorful..."
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="self-end px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
