import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  Globe,
  Loader2,
  FilePlus,
  HelpCircle,
  Search,
  BookOpen,
  MessageSquare,
  Send,
  Settings,
  Layers,
  ChevronDown,
  ChevronUp,
  Check,
  BookMarked,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { AIDeepDiveResponse, AIChatMessage, AISettings } from '../../types';
import {
  fetchAIDeepDive,
  fetchAIChat,
  fetchAISummary,
  getAIProviders,
  searchUserDocumentChunks,
} from '../../api/client';

export interface ParsedQueryItem {
  id: string;
  title: string;
  page?: number;
  reason?: string;
  scholarUrl: string;
  googleUrl: string;
}

export interface ParsedQueryResult {
  preamble: string;
  queries: ParsedQueryItem[];
}

export function parseSearchQueries(content: string): ParsedQueryResult {
  if (!content) return { preamble: '', queries: [] };

  const lines = content.split('\n');
  const queries: ParsedQueryItem[] = [];
  const preambleLines: string[] = [];

  let currentTitle: string | null = null;
  let currentPage: number | undefined = undefined;
  let currentReason: string | null = null;
  let hasFoundFirstQuery = false;

  const flushItem = () => {
    if (currentTitle && currentTitle.trim().length > 3) {
      let cleanTitle = currentTitle
        .replace(/^[\d\s.\-*•"“”'‘]+/, '')
        .replace(/[\s"“”'‘]+$/, '')
        .trim();

      const trailingPage = cleanTitle.match(/(?:\[Page\s+(\d+)\]|\(Page\s+(\d+)\)|Page\s+(\d+))$/i);
      if (trailingPage) {
        if (!currentPage) {
          currentPage = parseInt(trailingPage[1] || trailingPage[2] || trailingPage[3], 10);
        }
        cleanTitle = cleanTitle.replace(/(?:\[Page\s+(\d+)\]|\(Page\s+(\d+)\)|Page\s+(\d+))$/i, '').trim();
      }

      if (cleanTitle.length > 2) {
        const encoded = encodeURIComponent(cleanTitle);
        queries.push({
          id: String(queries.length + 1),
          title: cleanTitle,
          page: currentPage,
          reason: currentReason ? currentReason.trim() : undefined,
          scholarUrl: `https://scholar.google.com/scholar?q=${encoded}`,
          googleUrl: `https://www.google.com/search?q=${encoded}`,
        });
      }
    }
    currentTitle = null;
    currentPage = undefined;
    currentReason = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    // Check if this line is a Reason line
    const reasonMatch = line.match(/^(?:[-*•]\s*)?reason\s*:\s*(.*)/i);
    if (reasonMatch) {
      currentReason = (currentReason ? currentReason + ' ' : '') + reasonMatch[1].trim();
      continue;
    }

    // If currentReason is being accumulated and line doesn't look like a new query or header
    if (currentReason && !line.includes('"') && !line.match(/^(\d+[\.\)]|[-*•])\s+["\w]/i)) {
      currentReason += ' ' + line;
      continue;
    }

    // Check for page citation in line: [Page X] or (Page X) or Page X
    const pageMatch = line.match(/(?:\[Page\s+(\d+)\]|\(Page\s+(\d+)\)|Page\s+(\d+))/i);
    const extractedPage = pageMatch ? parseInt(pageMatch[1] || pageMatch[2] || pageMatch[3], 10) : undefined;

    // Check if line contains a quoted query: "something here"
    const quoteMatch = line.match(/"([^"]{4,})"/);
    if (quoteMatch) {
      flushItem();
      hasFoundFirstQuery = true;
      currentTitle = quoteMatch[1];
      currentPage = extractedPage;
      continue;
    }

    // Check if line is a list item: 1. something or * something
    const listMatch = line.match(/^(?:\d+[\.\)]|[-*•])\s+(.+)$/);
    if (listMatch) {
      const potentialText = listMatch[1].replace(/\[Page\s+\d+\]|\(Page\s+\d+\)/gi, '').trim();
      if (potentialText.length > 5) {
        flushItem();
        hasFoundFirstQuery = true;
        currentTitle = potentialText;
        currentPage = extractedPage;
        continue;
      }
    }

    // If we haven't found any query yet, treat lines as preamble
    if (!hasFoundFirstQuery) {
      preambleLines.push(rawLine);
      continue;
    }

    // If we have found queries and this line has length > 5, could be another query title without quotes
    if (!currentTitle) {
      flushItem();
      currentTitle = line.replace(/\[Page\s+\d+\]|\(Page\s+\d+\)/gi, '').trim();
      currentPage = extractedPage;
    }
  }

  flushItem();

  return {
    preamble: preambleLines.join('\n').trim(),
    queries,
  };
}

interface AIDeepDivePanelProps {
  initialQuery: string;
  initialMode?: string;
  documentId?: string | null;
  currentPage?: number;
  onAppendToNotes: (markdownSnippet: string) => void;
  onJumpToPage?: (pageNumber: number) => void;
  onSearchInDoc?: (searchTerm: string) => void;
  onOpenSettings?: () => void;
  aiSettings?: AISettings;
}

export const AIDeepDivePanel: React.FC<AIDeepDivePanelProps> = ({
  initialQuery,
  initialMode = 'explain',
  documentId,
  currentPage = 1,
  onAppendToNotes,
  onJumpToPage,
  onSearchInDoc,
  onOpenSettings,
  aiSettings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'deep_dive' | 'chat'>('deep_dive');

  // Concept Deep Dive state
  const [query, setQuery] = useState(initialQuery || '');
  const [mode, setMode] = useState(initialMode || 'explain');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIDeepDiveResponse | null>(null);
  const [appended, setAppended] = useState(false);

  // Filter & toggle for AI reasons (logged to console for verification)
  const [showReasons, setShowReasons] = useState(false);
  const [redirectingId, setRedirectingId] = useState<string | null>(null);

  // Fetch backend env filter (SHOW_AI_REASONS) on mount
  useEffect(() => {
    getAIProviders()
      .then((info) => {
        if (info && typeof info.show_ai_reasons === 'boolean') {
          setShowReasons(info.show_ai_reasons);
        }
      })
      .catch(() => {});
  }, []);

  // Parse structured literature queries when in search_queries mode or when reasons exist
  const parsedData = useMemo(() => {
    if (!result?.explanation) return { preamble: '', queries: [] };
    if (mode === 'search_queries' || result.explanation.toLowerCase().includes('reason:')) {
      return parseSearchQueries(result.explanation);
    }
    return { preamble: '', queries: [] };
  }, [result?.explanation, mode]);

  // Log reasons to browser console for user verification
  useEffect(() => {
    if (parsedData.queries.length > 0 && result) {
      console.groupCollapsed(
        `%c🔍 [AI Literature Queries & Reasons] (${parsedData.queries.length} items for "${result.query}")`,
        'font-weight: bold; color: #4f46e5; font-size: 11px;'
      );
      console.log('Mode:', mode);
      console.log('Reason visibility in UI:', showReasons ? 'Shown' : 'Hidden (Filtered by env/default)');
      parsedData.queries.forEach((q, idx) => {
        console.groupCollapsed(`Query #${idx + 1}: "${q.title}"${q.page ? ` [Page ${q.page}]` : ''}`);
        console.log('%cSearch Term:', 'font-weight: bold;', q.title);
        if (q.page) console.log('%cPage in Paper:', 'font-weight: bold; color: #7c3aed;', `Page ${q.page}`);
        if (q.reason) console.log('%cReason:', 'color: #059669; font-weight: bold;', q.reason);
        console.log('%cScholar URL:', 'color: #2563eb;', q.scholarUrl);
        console.groupEnd();
      });
      console.groupEnd();
    }
  }, [parsedData, result, mode, showReasons]);

  // Jump to page and trigger in-doc highlighting for any search query
  const handleRedirectToPaper = async (item: ParsedQueryItem) => {
    setRedirectingId(item.id);
    try {
      let targetPage = item.page;

      // If page is not known and we have documentId, find the best matching chunk page via RAG search
      if (!targetPage && documentId) {
        try {
          const ragRes = await searchUserDocumentChunks(documentId, item.title, 1);
          if (ragRes && ragRes.results && ragRes.results.length > 0) {
            targetPage = ragRes.results[0].page_number;
          }
        } catch (err) {
          console.warn('Could not locate chunk page via RAG search:', err);
        }
      }

      // 1. Jump directly to page if found
      if (targetPage && onJumpToPage) {
        onJumpToPage(targetPage);
      }

      // 2. Activate in-document search and highlight
      if (onSearchInDoc) {
        onSearchInDoc(item.title);
      }
    } finally {
      setTimeout(() => setRedirectingId(null), 1200);
    }
  };

  // Document Chat state
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [appendedMsgId, setAppendedMsgId] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // When initialQuery or initialMode changes from text selection, switch to Deep Dive tab and run
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setActiveSubTab('deep_dive');
      setQuery(initialQuery);
      const targetMode = initialMode || 'explain';
      setMode(targetMode);
      runDeepDive(initialQuery, targetMode);
    }
  }, [initialQuery, initialMode]);

  // Reset chat if paper changes
  useEffect(() => {
    setMessages([]);
  }, [documentId]);

  useEffect(() => {
    if (activeSubTab === 'chat' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeSubTab]);

  const runDeepDive = async (textToAnalyze: string, analysisMode: string) => {
    if (!textToAnalyze.trim()) return;
    setLoading(true);
    setAppended(false);
    try {
      const data = await fetchAIDeepDive(
        textToAnalyze,
        analysisMode,
        documentId || undefined,
        currentPage
      );
      setResult(data);
    } catch (err: any) {
      console.error('Deep dive error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAppendNotes = () => {
    if (!result) return;
    let snippet: string;
    if (parsedData.queries.length > 0) {
      const queriesMarkdown = parsedData.queries
        .map((q) => {
          let line = `- [ ] **"${q.title}"**${q.page ? ` [Page ${q.page}]` : ''} - [Scholar](${q.scholarUrl})`;
          if (showReasons && q.reason) {
            line += `\n  - *Reason:* ${q.reason}`;
          }
          return line;
        })
        .join('\n');

      snippet = `\n\n### AI Research Queries: ${result.query.slice(0, 60)}...\n${
        parsedData.preamble ? parsedData.preamble + '\n\n' : ''
      }${queriesMarkdown}\n\n[Google Reference](${result.google_search_url})\n`;
    } else {
      snippet = `\n\n### AI Deep Dive: ${result.query.slice(0, 60)}...\n${result.explanation}\n\n[Web Reference](${result.google_search_url})\n`;
    }
    onAppendToNotes(snippet);
    setAppended(true);
    setTimeout(() => setAppended(false), 2000);
  };

  const handleAppendChatMessage = (msg: AIChatMessage) => {
    const snippet = `\n\n### Paper Q&A: ${msg.content.slice(0, 50)}...\n${msg.content}\n`;
    onAppendToNotes(snippet);
    setAppendedMsgId(msg.id);
    setTimeout(() => setAppendedMsgId(null), 2000);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const question = (textToSend || chatInput).trim();
    if (!question || chatLoading) return;

    const userMsg: AIChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const historyPayload = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetchAIChat(
        documentId || undefined,
        question,
        currentPage,
        historyPayload,
        'qa'
      );

      const assistantMsg: AIChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: response.answer,
        cited_chunks: response.cited_chunks,
        suggested_followups: response.suggested_followups,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: AIChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `⚠️ **Error querying AI:** ${err?.message || 'Could not connect to model.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!documentId || chatLoading) return;
    setChatLoading(true);

    const userMsg: AIChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: 'Generate an Executive Summary and Key Takeaways for this paper.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetchAISummary(documentId, 'executive');
      const assistantMsg: AIChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: response.answer,
        cited_chunks: response.cited_chunks,
        suggested_followups: response.suggested_followups,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      const errorMsg: AIChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `⚠️ Failed to generate summary: ${e?.message || e}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Helper to sanitize markdown content and strip accidental code fences from LLMs
  const sanitizeMarkdownContent = (raw: string): string => {
    if (!raw) return '';
    let text = raw.trim();

    // 1. Strip full ```markdown ... ``` or ``` ... ``` wrappers
    text = text.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1');

    // 2. Strip ```markdown ... ``` when followed by commentary text
    text = text.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*\n?/i, '$1\n\n');

    // 3. Strip any general ```markdown blocks used purely for formatting
    text = text.replace(/```(?:markdown|md)\s*\n([\s\S]*?)\n```/gi, '$1');

    // 4. Remove 4+ leading spaces before markdown headers or bullet items (prevents indented code blocks)
    text = text.replace(/^[ \t]{4,}(?=[#\-*>]|\d+\.)/gm, '');

    return text.trim();
  };

  // Helper to render markdown and make [Page X] clickable
  const renderMarkdownWithPageCitations = (content: string) => {
    const cleanContent = sanitizeMarkdownContent(content);
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => (
            <pre className="p-2.5 my-2 rounded-lg bg-gray-100 dark:bg-gray-950 text-[11px] font-mono whitespace-pre-wrap break-words [word-break:break-word] overflow-x-auto border border-gray-200 dark:border-gray-800">
              {children}
            </pre>
          ),
          code: ({ inline, children, ...props }: any) => {
            if (inline) {
              return (
                <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[11px] font-mono text-indigo-600 dark:text-indigo-400" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="break-words [word-break:break-word] whitespace-pre-wrap font-mono" {...props}>
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1.5 leading-snug break-words">
              {renderPageCitationsInText(children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-gray-900 dark:text-gray-100 mt-2.5 mb-1 leading-snug break-words">
              {renderPageCitationsInText(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-2.5 mb-1 leading-snug break-words">
              {renderPageCitationsInText(children)}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-2 mb-0.5 leading-snug break-words">
              {renderPageCitationsInText(children)}
            </h4>
          ),
          p: ({ children }) => {
            return <p className="mb-2 leading-relaxed text-xs break-words">{renderPageCitationsInText(children)}</p>;
          },
          li: ({ children }) => {
            return <li className="my-0.5 text-xs break-words">{renderPageCitationsInText(children)}</li>;
          },
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    );
  };

  const renderPageCitationsInText = (nodes: React.ReactNode): React.ReactNode => {
    if (typeof nodes === 'string') {
      const parts = nodes.split(/(\[Page\s+\d+\])/gi);
      if (parts.length === 1) return nodes;

      return parts.map((part, idx) => {
        const match = part.match(/\[Page\s+(\d+)\]/i);
        if (match && onJumpToPage) {
          const pageNum = parseInt(match[1], 10);
          return (
            <button
              key={idx}
              onClick={() => onJumpToPage(pageNum)}
              className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 transition"
              title={`Jump to Page ${pageNum} in PDF`}
            >
              Page {pageNum}
            </button>
          );
        }
        return part;
      });
    }

    if (Array.isArray(nodes)) {
      return nodes.map((node, i) => (
        <React.Fragment key={i}>{renderPageCitationsInText(node)}</React.Fragment>
      ));
    }

    return nodes;
  };

  // Engine label for top pill
  const providerName = aiSettings?.provider || 'ollama';
  const engineLabel =
    providerName === 'ollama'
      ? `Ollama: ${aiSettings?.model || 'Local'}`
      : `${providerName.toUpperCase()}: ${aiSettings?.model || 'Cloud'}`;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-white dark:bg-gray-900">
      {/* Top AI Engine Status & Settings Trigger */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/70 select-none min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 text-[10px] text-gray-700 dark:text-gray-300 truncate transition"
            title="Configure AI model or API key"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="font-semibold truncate max-w-[140px]">{engineLabel}</span>
          </button>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {result && activeSubTab === 'deep_dive' && (
            <a
              href={result.google_search_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md"
              title="Search Google for concept"
            >
              <Globe className="w-3 h-3" />
              <span>Google</span>
            </a>
          )}
          <button
            onClick={onOpenSettings}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            title="AI Engine Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sub-tab switcher: Concept Deep Dive vs Ask Paper (RAG Chat) */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-800 px-3 pt-1.5 bg-gray-50/40 dark:bg-gray-900/40 gap-1 select-none overflow-x-hidden min-w-0">
        <button
          onClick={() => setActiveSubTab('deep_dive')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeSubTab === 'deep_dive'
              ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-gray-900 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Deep Dive</span>
        </button>

        <button
          onClick={() => setActiveSubTab('chat')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeSubTab === 'chat'
              ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-gray-900 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Ask Paper (RAG)</span>
          {messages.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              {messages.length}
            </span>
          )}
        </button>
      </div>

      {/* Mode 1: Concept Deep Dive */}
      {activeSubTab === 'deep_dive' && (
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden min-w-0 p-3.5">
          {/* Query Input & Mode Selector */}
          <div className="space-y-2 mb-3">
            <textarea
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Highlight text in the PDF or type an equation/concept to analyze..."
              className="w-full text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />

            {/* Modes */}
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: 'define', label: 'In-Paper Def', icon: BookMarked },
                { id: 'explain', label: 'Explain', icon: BookOpen },
                { id: 'summarize', label: 'Summarize', icon: FilePlus },
                { id: 'search_queries', label: 'Keywords', icon: Search },
                { id: 'critique', label: 'Critique', icon: HelpCircle },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setMode(m.id);
                      if (query) runDeepDive(query, m.id);
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition ${
                      mode === m.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{m.label}</span>
                  </button>
                );
              })}

              <button
                onClick={() => runDeepDive(query, mode)}
                disabled={loading || !query.trim()}
                className="ml-auto px-3 py-1 rounded-md text-[11px] font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm disabled:opacity-40 transition flex items-center gap-1"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>Analyze</span>
              </button>
            </div>
          </div>

          {/* Results Display */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              <p className="text-xs">Reasoning with {providerName.toUpperCase()}...</p>
            </div>
          ) : result ? (
            <div className="flex-1 space-y-4 pt-1 min-w-0">
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 min-w-0 overflow-hidden break-words [word-break:break-word]">
                {parsedData.queries.length > 0 ? (
                  <div className="space-y-3 min-w-0">
                    {/* Preamble if present */}
                    {parsedData.preamble && (
                      <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium break-words [word-break:break-word] min-w-0">
                        {renderMarkdownWithPageCitations(parsedData.preamble)}
                      </div>
                    )}

                    {/* Section header with count and reasons toggle */}
                    <div className="flex items-center justify-between pt-1 pb-1 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Search Queries ({parsedData.queries.length})
                        </span>
                        <span className="text-[10px] text-gray-400">· Click title to jump & highlight</span>
                      </div>

                      <button
                        onClick={() => setShowReasons((prev) => !prev)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        title={showReasons ? "Hide reasons to keep UI compact" : "Show detailed reasons in UI (also logged to console)"}
                      >
                        {showReasons ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showReasons ? 'Hide Reasons' : 'Show Reasons'}</span>
                      </button>
                    </div>

                    {/* Query Cards */}
                    <div className="space-y-2">
                      {parsedData.queries.map((q) => {
                        const isRedirecting = redirectingId === q.id;

                        return (
                          <div
                            key={q.id}
                            className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/80 hover:border-indigo-300 dark:hover:border-indigo-600 shadow-sm transition group"
                          >
                            {/* Title & Redirection Action */}
                            <div className="flex items-start justify-between gap-2">
                              <button
                                onClick={() => handleRedirectToPaper(q)}
                                className="text-left font-medium text-xs text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition leading-snug flex-1 cursor-pointer"
                                title="Click to jump to where this appears in the paper and highlight it"
                              >
                                <span className="font-semibold text-indigo-500 mr-1.5">#{q.id}</span>
                                <span>"{q.title}"</span>
                              </button>

                              {/* Status / Page Badge */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {isRedirecting ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 animate-pulse">
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    Jumping...
                                  </span>
                                ) : q.page ? (
                                  <button
                                    onClick={() => handleRedirectToPaper(q)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800 transition"
                                    title={`Jump to Page ${q.page} in paper`}
                                  >
                                    <BookMarked className="w-2.5 h-2.5" />
                                    Page {q.page}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRedirectToPaper(q)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 hover:bg-indigo-50 dark:bg-gray-800 dark:hover:bg-indigo-950 text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 transition"
                                    title="Locate concept in paper via RAG search"
                                  >
                                    <Search className="w-2.5 h-2.5" />
                                    Locate
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Quick Actions Row */}
                            <div className="mt-2 flex items-center justify-between text-[11px] pt-1.5 border-t border-gray-100 dark:border-gray-800">
                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={() => handleRedirectToPaper(q)}
                                  className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                  title="Jump to paper location and highlight phrase"
                                >
                                  <Search className="w-3 h-3" />
                                  <span>Highlight in PDF</span>
                                </button>

                                <a
                                  href={q.scholarUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                  title="Search Google Scholar for academic papers"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Scholar</span>
                                </a>
                              </div>

                            </div>

                            {/* Reason Section: Hidden by default, collapsible or visible when toggled */}
                            {q.reason && (
                              showReasons ? (
                                <div className="mt-2 pl-2.5 border-l-2 border-indigo-400 dark:border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 py-1 pr-1.5 rounded-r text-[11px] text-gray-700 dark:text-gray-300">
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 block text-[10px] mb-0.5">
                                    Relevance to paper:
                                  </span>
                                  <p className="leading-relaxed italic">{q.reason}</p>
                                </div>
                              ) : (
                                <details className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                                  <summary className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none flex items-center gap-1">
                                    <span>Why this query? (click to view)</span>
                                  </summary>
                                  <p className="mt-1 pl-2 border-l border-gray-200 dark:border-gray-700 text-[11px] text-gray-600 dark:text-gray-300 italic">
                                    {q.reason}
                                  </p>
                                </details>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-xs dark:prose-invert max-w-none break-words [word-break:break-word] text-gray-800 dark:text-gray-200 min-w-0 overflow-hidden">
                    {renderMarkdownWithPageCitations(result.explanation)}
                  </div>
                )}

                <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <button
                    onClick={handleAppendNotes}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline flex items-center gap-1"
                  >
                    {appended ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <FilePlus className="w-3.5 h-3.5" />}
                    <span>{appended ? 'Added to Notes!' : 'Append to Notes'}</span>
                  </button>

                  <a
                    href={result.google_search_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Google Search</span>
                  </a>
                </div>
              </div>

              {/* Suggested Followups */}
              {result.suggested_followups.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Explore Follow-up Questions
                  </span>
                  <div className="space-y-1">
                    {result.suggested_followups.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setQuery(q);
                          runDeepDive(q, 'explain');
                        }}
                        className="w-full text-left p-2 rounded-lg text-xs bg-purple-50/50 dark:bg-purple-950/20 text-purple-900 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/40 border border-purple-200/50 dark:border-purple-800/40 transition flex items-center justify-between group"
                      >
                        <span className="truncate">{q}</span>
                        <Sparkles className="w-3 h-3 text-purple-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
              <Sparkles className="w-8 h-8 text-purple-400/50 mb-2" />
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Deep Dive Ready</h4>
              <p className="text-[11px] text-gray-400 max-w-xs mt-1">
                Select any text or formula on the PDF, or type a term above to get contextual breakdown and literature discovery.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Ask Paper (Conversational RAG) */}
      {activeSubTab === 'chat' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-3.5 min-w-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-gray-400">
                <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">Chat with this Paper</h4>
                <p className="text-[11px] text-gray-400 max-w-xs mt-1 mb-4">
                  Ask questions grounded directly in the paper's extracted text chunks with verified page citations.
                </p>

                {/* Quick Starters */}
                <div className="w-full space-y-1.5 text-left">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Suggested Questions:
                  </span>
                  <button
                    onClick={() => handleSendMessage('What is the main contribution and hypothesis of this paper?')}
                    className="w-full text-left p-2 rounded-lg text-xs bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 transition"
                  >
                    🎯 What is the main contribution and hypothesis?
                  </button>
                  <button
                    onClick={() => handleSendMessage('What datasets, benchmarks, or experimental setup was used?')}
                    className="w-full text-left p-2 rounded-lg text-xs bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 transition"
                  >
                    📊 What datasets and benchmarks were used?
                  </button>
                  <button
                    onClick={handleGenerateSummary}
                    className="w-full text-left p-2 rounded-lg text-xs bg-purple-50/60 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800/60 transition"
                  >
                    ⚡ Generate Executive Summary & Key Findings
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isSourcesOpen = Boolean(expandedSources[msg.id]);

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl p-3 text-xs shadow-sm ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700/60 rounded-tl-none'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="prose prose-xs dark:prose-invert max-w-none">
                          {renderMarkdownWithPageCitations(msg.content)}
                        </div>
                      )}

                      {/* Cited Chunks / Sources Section */}
                      {!isUser && msg.cited_chunks && msg.cited_chunks.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() =>
                              setExpandedSources((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                            }
                            className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                          >
                            <Layers className="w-3 h-3" />
                            <span>{msg.cited_chunks.length} Grounded Excerpts</span>
                            {isSourcesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {isSourcesOpen && (
                            <div className="mt-1.5 space-y-1.5 animate-in fade-in duration-100">
                              {msg.cited_chunks.map((c, i) => (
                                <div
                                  key={i}
                                  onClick={() => onJumpToPage && onJumpToPage(c.page_number)}
                                  className="p-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-indigo-400 transition text-[10px]"
                                >
                                  <div className="flex items-center justify-between font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">
                                    <span>Page {c.page_number}</span>
                                    <span className="text-[9px] text-gray-400">Match score: {c.score}</span>
                                  </div>
                                  <p className="text-gray-600 dark:text-gray-300 italic">"{c.snippet}"</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Append to notes button */}
                      {!isUser && (
                        <div className="mt-2 flex items-center justify-end gap-2 text-[10px]">
                          <button
                            onClick={() => handleAppendChatMessage(msg)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                          >
                            {appendedMsgId === msg.id ? (
                              <>
                                <Check className="w-2.5 h-2.5 text-emerald-500" />
                                <span>Appended!</span>
                              </>
                            ) : (
                              <>
                                <FilePlus className="w-2.5 h-2.5" />
                                <span>Add to Notes</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Follow-up suggestions */}
                    {!isUser && msg.suggested_followups && msg.suggested_followups.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 max-w-[92%]">
                        {msg.suggested_followups.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSendMessage(q)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 hover:bg-indigo-50 dark:bg-gray-800 dark:hover:bg-indigo-950 text-gray-600 dark:text-gray-300 hover:text-indigo-600 border border-gray-200 dark:border-gray-700 transition"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {chatLoading && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Synthesizing answer from paper chunks...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Composer Input */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask anything about this paper... (e.g. What dataset?)"
                className="flex-1 text-xs p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={chatLoading || !chatInput.trim()}
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition shadow-sm"
                title="Send Question"
              >
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1 px-1">
              <span>Enter to send</span>
              {documentId && (
                <button
                  onClick={handleGenerateSummary}
                  disabled={chatLoading}
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  Summarize Paper
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
