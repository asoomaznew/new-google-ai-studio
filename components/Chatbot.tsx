import React, { useState, useRef, useEffect } from 'react';
import { Send, Trash, User, Bot, AlertCircle, X, MessageSquare } from 'lucide-react';
import { getLLMConfig, callLocalLLM } from '../services/localLlmService';

interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'error';
  text: string;
}

interface ChatbotProps {
  currentMode: string;
}

export default function Chatbot({ currentMode }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState(() => Math.random().toString(36).substring(7));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const systemInstruction = `You are a professional financial AI assistant for Mazaya Finance. Provide concise, clear, and accurate answers. The user is currently using the "${currentMode}" module in the application. You can help them understand the tools, analyze files, or guide them.`;

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const config = getLLMConfig();
      if (config.provider === 'local') {
          // Just pass the current chat as history in the prompt roughly
          const history = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
          const prompt = `${systemInstruction}\n\nChat History:\n${history}\nUser: ${userMsg.text}\nAssistant:`;
          const result = await callLocalLLM(prompt, null, config.modelName, config.baseUrl);
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: result.text }]);
      } else {
        const response = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            message: userMsg.text,
            model: 'gemini-3.5-flash',
            systemInstruction
          })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }
        
        const data = await response.json();
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: data.text }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'error', text: 'Error: ' + error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    setMessages([]);
    setChatId(Math.random().toString(36).substring(7));
    try {
      await fetch('/api/gemini/chat/' + chatId, { method: 'DELETE' });
    } catch(e) {}
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-sky-600 text-white rounded-full shadow-lg hover:bg-sky-500 transition-transform transform hover:scale-105 z-50 animate-fade-in"
        title="Open AI Assistant"
      >
        <MessageSquare className="w-7 h-7" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 flex flex-col h-[600px] max-h-[80vh] bg-dark-200 border border-dark-300 rounded-lg shadow-2xl overflow-hidden animate-fade-in z-50">
      <div className="p-4 bg-dark-300 border-b flex justify-between items-center" style={{ borderColor: '#374151' }}>
        <div>
           <h2 className="text-lg font-semibold text-slate-200 flex items-center">
            <Bot className="w-5 h-5 mr-2 text-sky-400" />
            AI Assistant
           </h2>
           <p className="text-xs text-slate-400">Powered by Gemini Flash Lite</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleClear} className="text-slate-400 hover:text-rose-400 p-2 rounded transition-colors" title="Clear Chat">
            <Trash className="w-4 h-4" />
          </button>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-200 p-2 rounded transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-dark-100/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-4">
             <Bot className="w-12 h-12 mb-3 text-slate-600" />
             <p className="font-medium text-slate-300 mb-1">How can I help you today?</p>
             <p className="text-sm">I can answer questions about the {currentMode} tool or analyze standard files.</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user' ? 'bg-sky-600 text-white' : 
                msg.role === 'error' ? 'bg-rose-900/50 text-rose-200 border border-rose-800' :
                'bg-dark-300 text-slate-200 border border-dark-400'
              }`}>
                {msg.role === 'model' && <Bot className="w-4 h-4 mb-1 text-sky-400 inline-block mr-2" />}
                {msg.role === 'user' && <User className="w-4 h-4 mb-1 text-sky-200 inline-block mr-2" />}
                {msg.role === 'error' && <AlertCircle className="w-4 h-4 mb-1 text-rose-400 inline-block mr-2" />}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-dark-300 border-t" style={{ borderColor: '#374151' }}>
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-dark-100 border border-slate-600 text-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-sky-500 text-sm"
            placeholder="Ask me anything..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-sky-600 hover:bg-sky-500 text-white rounded-lg px-4 py-2 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
