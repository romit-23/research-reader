import React, { useState, useEffect } from 'react';
import {
  Activity,
  Database,
  Layers,
  Search,
  X,
  RefreshCw,
  Server,
  FileText,
  Users,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Loader2,
  HardDrive
} from 'lucide-react';
import {
  getAdminHealth,
  getAdminTableRecords,
  getAdminRagDocuments,
  triggerDocumentChunking,
  getAdminDocumentChunks,
  testRagSearch,
} from '../../api/client';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AdminTab = 'health' | 'explorer' | 'rag';

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('health');

  // Health state
  const [healthData, setHealthData] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Explorer state
  const [selectedTable, setSelectedTable] = useState<string>('documents');
  const [tableData, setTableData] = useState<any>(null);
  const [tableSearch, setTableSearch] = useState<string>('');
  const [loadingTable, setLoadingTable] = useState(false);
  const [inspectRow, setInspectRow] = useState<any>(null);

  // RAG state
  const [ragDocs, setRagDocs] = useState<any[]>([]);
  const [loadingRagDocs, setLoadingRagDocs] = useState(false);
  const [chunkingDocId, setChunkingDocId] = useState<string | null>(null);
  const [selectedRagDoc, setSelectedRagDoc] = useState<any>(null);
  const [docChunks, setDocChunks] = useState<any[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // RAG Testbed state
  const [searchQuery, setSearchQuery] = useState('attention neural network');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingRag, setSearchingRag] = useState(false);

  // Fetch health data
  const loadHealth = async () => {
    setLoadingHealth(true);
    setAuthError(null);
    try {
      const data = await getAdminHealth();
      setHealthData(data);
    } catch (err: any) {
      console.error('Failed to fetch health data:', err);
      setAuthError('Access Denied: Administrator privileges required to view the Database & RAG Admin Hub.');
    } finally {
      setLoadingHealth(false);
    }
  };

  // Fetch table records
  const loadTableRecords = async (table: string, search = '') => {
    setLoadingTable(true);
    try {
      const data = await getAdminTableRecords(table, 1, 50, search);
      setTableData(data);
    } catch (err) {
      console.error(`Failed to fetch table ${table}:`, err);
    } finally {
      setLoadingTable(false);
    }
  };

  // Fetch RAG documents
  const loadRagDocs = async () => {
    setLoadingRagDocs(true);
    try {
      const data = await getAdminRagDocuments();
      setRagDocs(data);
    } catch (err) {
      console.error('Failed to fetch RAG docs:', err);
    } finally {
      setLoadingRagDocs(false);
    }
  };

  // Trigger chunking
  const handleChunkDocument = async (docId: string) => {
    setChunkingDocId(docId);
    try {
      await triggerDocumentChunking(docId, 150, 30);
      await loadRagDocs();
      if (selectedRagDoc?.id === docId) {
        await loadDocumentChunks(docId);
      }
    } catch (err) {
      console.error('Failed to chunk document:', err);
    } finally {
      setChunkingDocId(null);
    }
  };

  // Load document chunks
  const loadDocumentChunks = async (docId: string) => {
    setLoadingChunks(true);
    try {
      const chunks = await getAdminDocumentChunks(docId);
      setDocChunks(chunks);
    } catch (err) {
      console.error('Failed to load chunks:', err);
    } finally {
      setLoadingChunks(false);
    }
  };

  // Test RAG search
  const handleTestSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchingRag(true);
    try {
      const res = await testRagSearch(searchQuery, selectedRagDoc?.id);
      setSearchResults(res.results || []);
    } catch (err) {
      console.error('Failed to test search:', err);
    } finally {
      setSearchingRag(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'health') loadHealth();
      else if (activeTab === 'explorer') loadTableRecords(selectedTable, tableSearch);
      else if (activeTab === 'rag') loadRagDocs();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (isOpen && activeTab === 'explorer') {
      loadTableRecords(selectedTable, tableSearch);
    }
  }, [selectedTable]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-900 w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>Database & AI RAG Admin Hub</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  Live Admin
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                Inspect database health, explore tables, and manage document chunking for AI vector RAG.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (activeTab === 'health') loadHealth();
                else if (activeTab === 'explorer') loadTableRecords(selectedTable, tableSearch);
                else if (activeTab === 'rag') loadRagDocs();
              }}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHealth || loadingTable || loadingRagDocs ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-gray-200 dark:border-gray-800 flex gap-6 bg-white dark:bg-gray-900">
          <button
            onClick={() => setActiveTab('health')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'health'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Database Health & Metrics</span>
          </button>
          <button
            onClick={() => setActiveTab('explorer')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'explorer'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Table Data Explorer</span>
          </button>
          <button
            onClick={() => setActiveTab('rag')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'rag'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>AI RAG & Chunking Lab</span>
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-950/50">
          {authError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <div>
                <p className="font-bold">Access Restricted</p>
                <p className="text-[11px] opacity-90">{authError}</p>
              </div>
            </div>
          )}

          {/* TAB 1: HEALTH */}
          {activeTab === 'health' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Primary Status Card */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl ${healthData?.database_connected ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 text-rose-600'}`}>
                    {healthData?.database_connected ? <CheckCircle2 className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Database Engine</div>
                    <div className="text-lg font-extrabold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <span>{healthData?.database_info?.dialect || 'Checking dialect...'}</span>
                      {healthData?.database_info?.is_cloud && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-mono">
                          Cloud Production
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-md">
                      Host: {healthData?.database_info?.host || 'local'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-800 pt-3 md:pt-0 md:pl-6">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 uppercase font-bold">Latency</div>
                    <div className="text-xl font-mono font-black text-indigo-600 dark:text-indigo-400">
                      {healthData?.latency_ms !== undefined ? `${healthData.latency_ms} ms` : '--'}
                    </div>
                  </div>
                  <div className="text-center pl-4 border-l border-gray-200 dark:border-gray-800">
                    <div className="text-xs text-gray-400 uppercase font-bold">Status</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Online</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table Metric Cards */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Live Table Row Counts</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="flex items-center justify-between text-gray-400 mb-1">
                      <span className="text-xs font-medium">Users</span>
                      <Users className="w-3.5 h-3.5 text-indigo-500" />
                    </div>
                    <div className="text-2xl font-black text-gray-900 dark:text-gray-100 font-mono">
                      {healthData?.table_counts?.users ?? 0}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="flex items-center justify-between text-gray-400 mb-1">
                      <span className="text-xs font-medium">Documents</span>
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div className="text-2xl font-black text-gray-900 dark:text-gray-100 font-mono">
                      {healthData?.table_counts?.documents ?? 0}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="flex items-center justify-between text-gray-400 mb-1">
                      <span className="text-xs font-medium">Annotations</span>
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    </div>
                    <div className="text-2xl font-black text-gray-900 dark:text-gray-100 font-mono">
                      {healthData?.table_counts?.annotations ?? 0}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="flex items-center justify-between text-gray-400 mb-1">
                      <span className="text-xs font-medium">Notes</span>
                      <FileText className="w-3.5 h-3.5 text-purple-500" />
                    </div>
                    <div className="text-2xl font-black text-gray-900 dark:text-gray-100 font-mono">
                      {healthData?.table_counts?.document_notes ?? 0}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 bg-gradient-to-br from-white to-indigo-50/40 dark:from-gray-900 dark:to-indigo-950/20">
                    <div className="flex items-center justify-between text-gray-400 mb-1">
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">RAG Chunks</span>
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                      {healthData?.table_counts?.document_chunks ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Storage Stats */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Local PDF Storage</h4>
                    <p className="text-xs text-gray-500">
                      Total PDF files stored on disk in <code className="font-mono text-indigo-500">backend/storage/</code>
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-base font-bold text-gray-900 dark:text-gray-100">
                    {healthData?.storage_stats?.pdf_count ?? 0} PDFs
                  </div>
                  <div className="text-xs text-gray-400">
                    {healthData?.storage_stats?.total_size_mb ?? 0} MB total
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TABLE EXPLORER */}
          {activeTab === 'explorer' && (
            <div className="space-y-4">
              {/* Table Selector & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-fit">
                  {['users', 'documents', 'annotations', 'document_notes', 'document_chunks'].map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setSelectedTable(t);
                        setTableSearch('');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                        selectedTable === t
                          ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm font-semibold'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                      }`}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      loadTableRecords(selectedTable, e.target.value);
                    }}
                    placeholder={`Search ${selectedTable}...`}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                {loadingTable ? (
                  <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="text-xs">Loading records...</span>
                  </div>
                ) : !tableData || tableData.rows.length === 0 ? (
                  <div className="p-12 text-center text-gray-400 text-xs">
                    No records found in table <code className="font-mono text-indigo-500">{selectedTable}</code>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[55vh]">
                    <table className="w-full text-left text-xs text-gray-600 dark:text-gray-300">
                      <thead className="text-[11px] uppercase bg-gray-50 dark:bg-gray-800 text-gray-400 font-mono sticky top-0 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {tableData.columns.map((c: string) => (
                            <th key={c} className="px-4 py-2.5 font-semibold">
                              {c.replace('_', ' ')}
                            </th>
                          ))}
                          <th className="px-4 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {tableData.rows.map((row: any, idx: number) => (
                          <tr
                            key={idx}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition font-mono text-[11px]"
                          >
                            {tableData.columns.map((c: string) => (
                              <td key={c} className="px-4 py-2.5 max-w-xs truncate" title={String(row[c] ?? '')}>
                                {String(row[c] ?? 'null')}
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => setInspectRow(row)}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline font-sans font-medium"
                              >
                                JSON
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AI RAG & CHUNKING */}
          {activeTab === 'rag' && (
            <div className="space-y-6">
              {/* Overview Callout */}
              <div className="p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20 flex items-start gap-3">
                <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    Retrieval-Augmented Generation (RAG) Architecture
                  </span>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                    Documents are parsed page-by-page into semantic sliding-window chunks with word overlap. In the future, embedding models generate vector embeddings for each chunk to allow AI question answering across your research papers.
                  </p>
                </div>
              </div>

              {/* Document Chunking Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                  Document Chunking Status
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ragDocs.map((doc) => {
                    const isSelected = selectedRagDoc?.id === doc.id;
                    const isChunking = chunkingDocId === doc.id;

                    return (
                      <div
                        key={doc.id}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-500 bg-white dark:bg-gray-900 ring-2 ring-indigo-500/20'
                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate" title={doc.name}>
                              {doc.name}
                            </h4>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium shrink-0 ${
                                doc.is_chunked
                                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {doc.is_chunked ? `${doc.chunk_count} Chunks` : 'Unchunked'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] font-mono text-gray-400 mb-3">
                            <span>{doc.page_count} Pages</span>
                            <span>•</span>
                            <span>{Math.round(doc.file_size / 1024)} KB</span>
                            {doc.total_tokens > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-indigo-500">{doc.total_tokens.toLocaleString()} Tokens</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                          <button
                            onClick={() => handleChunkDocument(doc.id)}
                            disabled={isChunking}
                            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 transition"
                          >
                            {isChunking ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Processing...</span>
                              </>
                            ) : (
                              <>
                                <Layers className="w-3 h-3" />
                                <span>{doc.is_chunked ? 'Re-Chunk' : 'Generate Chunks'}</span>
                              </>
                            )}
                          </button>

                          {doc.is_chunked && (
                            <button
                              onClick={() => {
                                setSelectedRagDoc(doc);
                                loadDocumentChunks(doc.id);
                              }}
                              className="py-1.5 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition"
                            >
                              View
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chunk Inspector & RAG Search Testbed */}
              {selectedRagDoc && (
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <span>Chunk Inspector: {selectedRagDoc.name}</span>
                        <span className="text-xs font-normal text-gray-400">({docChunks.length} chunks)</span>
                      </h4>
                      <p className="text-xs text-gray-500">
                        Inspecting partitioned chunks ready for vector embeddings and search.
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedRagDoc(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Close Inspector
                    </button>
                  </div>

                  {/* Interactive RAG Search Testbed */}
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-indigo-500" />
                      <span>RAG Similarity Retrieval Testbed</span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()}
                        placeholder="Search concepts across chunks (e.g. self-attention, loss function)..."
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={handleTestSearch}
                        disabled={searchingRag || !searchQuery.trim()}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-50 transition"
                      >
                        {searchingRag ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        <span>Retrieve Chunks</span>
                      </button>
                    </div>

                    {/* Search Results Display */}
                    {searchResults.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div className="text-[11px] font-mono text-gray-400">
                          Top {searchResults.length} relevant chunks found:
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {searchResults.map((r, i) => (
                            <div key={i} className="p-3 rounded-lg border border-indigo-100 dark:border-indigo-950 bg-indigo-50/30 dark:bg-indigo-950/10 text-xs">
                              <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 mb-1">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">Score: {r.score}% Match</span>
                                <span>Page {r.page_number} (Chunk #{r.chunk_index})</span>
                              </div>
                              <p className="text-gray-800 dark:text-gray-200 line-clamp-3 leading-relaxed">
                                {r.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chunks List */}
                  {loadingChunks ? (
                    <div className="p-8 text-center text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
                      <span className="text-xs">Loading chunks...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                      {docChunks.map((c) => (
                        <div key={c.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 mb-1.5">
                              <span className="font-semibold text-indigo-600 dark:text-indigo-400">Chunk #{c.chunk_index}</span>
                              <span>Page {c.page_number}</span>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 line-clamp-4 leading-relaxed font-sans">
                              {c.content}
                            </p>
                          </div>
                          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[10px] font-mono text-gray-400">
                            <span>{c.token_count} words</span>
                            <span>{c.has_embedding ? 'Vector Ready' : 'Text Only'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Inspect Row Modal */}
        {inspectRow && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white dark:bg-gray-900 max-w-xl w-full p-5 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Record Inspection</h4>
                <button onClick={() => setInspectRow(null)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-gray-100 dark:bg-gray-800 font-mono text-xs overflow-x-auto max-h-80 text-gray-800 dark:text-gray-200">
                {JSON.stringify(inspectRow, null, 2)}
              </pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
