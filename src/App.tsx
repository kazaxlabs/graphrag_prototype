/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  Sparkles,
  Terminal,
  Database,
  Activity,
  Layers,
  AlertCircle,
  Cpu,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  BookOpen,
  CheckCircle,
  HelpCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GraphData, Node, Edge, NodeType } from './types';
import { SCENARIOS, Scenario } from './scenarios';
import GraphCanvas from './components/GraphCanvas';

// Helper to determine tailwind color for Node categories
const CATEGORY_COLORS: Record<NodeType, { bg: string; text: string; border: string; accent: string }> = {
  Person: {
    bg: 'bg-blue-950/40',
    text: 'text-blue-300',
    border: 'border-blue-800/50',
    accent: 'bg-blue-500',
  },
  Organization: {
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    border: 'border-emerald-800/50',
    accent: 'bg-emerald-500',
  },
  Infrastructure: {
    bg: 'bg-red-950/40',
    text: 'text-red-300',
    border: 'border-red-800/50',
    accent: 'bg-red-500',
  },
  Event: {
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    border: 'border-amber-800/50',
    accent: 'bg-amber-500',
  },
  Concept: {
    bg: 'bg-purple-950/40',
    text: 'text-purple-300',
    border: 'border-purple-800/50',
    accent: 'bg-purple-500',
  },
};

export default function App() {
  const [scenarios] = useState<Scenario[]>(SCENARIOS);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(SCENARIOS[0].id);

  // Core state: Unstructured input text and the interactive graph data
  const [inputText, setInputText] = useState<string>(SCENARIOS[0].unstructuredText);
  const [graphData, setGraphData] = useState<GraphData>(SCENARIOS[0].graphData);

  // Left panel navigation tabs
  const [activeTab, setActiveTab] = useState<'text' | 'json' | 'docs'>('text');

  // Interactive hover and select states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Raw JSON editing variables
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Gemini Extraction status state
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState<boolean>(false);
  const [extractionSteps, setExtractionSteps] = useState<string[]>([]);

  // Update editor text when graph data changes (e.g., loaded from preset or extracted)
  useEffect(() => {
    setJsonText(JSON.stringify(graphData, null, 2));
    setJsonError(null);
  }, [graphData]);

  // Load preset scenario
  const handleSelectScenario = (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (scenario) {
      setSelectedScenarioId(scenarioId);
      setInputText(scenario.unstructuredText);
      setGraphData(scenario.graphData);
      setSelectedNodeId(null);
      setExtractionError(null);
    }
  };

  // Live validation when user types in RAW JSON Graph Editor
  const handleJsonChange = (val: string) => {
    setJsonText(val);
    try {
      const parsed = JSON.parse(val);

      // Simple structural validation
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
        throw new Error('Missing "nodes" array root.');
      }
      if (!parsed.edges || !Array.isArray(parsed.edges)) {
        throw new Error('Missing "edges" array root.');
      }

      // Check node ids type
      parsed.nodes.forEach((n: any, idx: number) => {
        if (!n.id || typeof n.id !== 'string') {
          throw new Error(`Node at index ${idx} is missing a string "id".`);
        }
        if (!n.type || typeof n.type !== 'string') {
          throw new Error(`Node "${n.id}" is missing a string "type".`);
        }
        if (!n.label || typeof n.label !== 'string') {
          throw new Error(`Node "${n.id}" is missing a string "label".`);
        }
      });

      // Check edge sources and targets match node ids
      const validNodeIds = new Set(parsed.nodes.map((n: any) => n.id));
      parsed.edges.forEach((e: any, idx: number) => {
        if (!e.source || typeof e.source !== 'string') {
          throw new Error(`Edge at index ${idx} is missing a string "source".`);
        }
        if (!e.target || typeof e.target !== 'string') {
          throw new Error(`Edge at index ${idx} is missing a string "target".`);
        }
        if (!e.relation || typeof e.relation !== 'string') {
          throw new Error(`Edge between "${e.source}" and "${e.target}" is missing a string "relation".`);
        }
        if (!validNodeIds.has(e.source)) {
          throw new Error(`Edge connects from non-existent node ID "${e.source}".`);
        }
        if (!validNodeIds.has(e.target)) {
          throw new Error(`Edge connects to non-existent node ID "${e.target}".`);
        }
      });

      setJsonError(null);
      setGraphData(parsed); // Update interactive WebGL scene in real-time
    } catch (err: any) {
      setJsonError(err.message || 'Malformed JSON format.');
    }
  };

  // Run Gemini text-to-graph extraction engine via Full-Stack Express API
  const handleExtractGraph = async () => {
    if (!inputText.trim()) return;

    setIsExtracting(true);
    setExtractionError(null);
    setIsApiKeyMissing(false);
    setExtractionSteps([]);

    // Staggered pseudo steps to provide a gorgeous futuristic cyberpunk loading state
    const addStep = (msg: string) => setExtractionSteps((prev) => [...prev, msg]);

    try {
      addStep('Initializing secure connection to server...');
      await new Promise((resolve) => setTimeout(resolve, 600));

      addStep('Transmitting unstructured payload text...');
      await new Promise((resolve) => setTimeout(resolve, 500));

      addStep('Gemini-3.5-Flash parsing entities (Nodes) and semantic links...');

      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.isApiKeyMissing) {
          setIsApiKeyMissing(true);
        }
        throw new Error(data.error || 'Server-side extraction failed.');
      }

      addStep('Analyzing relationships schema & mapping ontology levels...');
      await new Promise((resolve) => setTimeout(resolve, 400));

      addStep('Assembling 3D isometric city grid layout...');
      await new Promise((resolve) => setTimeout(resolve, 300));

      setGraphData(data);
      setActiveTab('json'); // Switch to editor to see result
      setSelectedNodeId(null);
    } catch (err: any) {
      setExtractionError(err.message || 'An error occurred during structured extraction.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Helpers to add/remove elements directly via JSON Editor
  const handleAddNode = () => {
    const defaultNodeId = `node_${Date.now().toString().slice(-4)}`;
    const updated: GraphData = {
      nodes: [
        ...graphData.nodes,
        {
          id: defaultNodeId,
          type: 'Concept',
          label: 'New Node',
          metadata: { status: 'Manual addition' },
          history: ['Manually spawned into cityscape grid.'],
        },
      ],
      edges: [...graphData.edges],
    };
    setGraphData(updated);
  };

  const handleClearGraph = () => {
    if (confirm('Are you sure you want to wipe the current canvas?')) {
      setGraphData({ nodes: [], edges: [] });
      setSelectedNodeId(null);
    }
  };

  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(graphData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', 'graphrag_city_export.json');
    dlAnchorElem.click();
  };

  // Selected Node Details
  const activeNode = graphData.nodes.find((n) => n.id === selectedNodeId) || null;
  const activeNodeColors = activeNode ? CATEGORY_COLORS[activeNode.type] : null;

  // Connected edges and neighboring nodes
  const directEdges = activeNode
    ? graphData.edges.filter((e) => e.source === activeNode.id || e.target === activeNode.id)
    : [];

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Header Navigation Bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 rounded-lg blur-md opacity-40 animate-pulse" />
            <div className="relative p-2 bg-slate-950 rounded-lg border border-indigo-500/50 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <h1 className="text-md font-bold tracking-wider uppercase bg-gradient-to-r from-indigo-200 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
              GraphRAG City
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              3D Cityscape Entity Extractor & Layout Engine
            </p>
          </div>
        </div>

        {/* Top middle status block */}
        <div className="hidden md:flex items-center gap-6 text-[11px] font-mono">
          <div className="flex items-center gap-2 text-slate-400 bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
            <span>MODEL: <strong className="text-slate-200">gemini-3.5-flash</strong></span>
          </div>

          <div className="flex items-center gap-2 text-slate-400 bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>NODES: <strong className="text-emerald-400">{graphData.nodes.length}</strong></span>
          </div>

          <div className="flex items-center gap-2 text-slate-400 bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>EDGES: <strong className="text-blue-400">{graphData.edges.length}</strong></span>
          </div>
        </div>

        {/* Right download controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-xs font-mono rounded border border-slate-800 hover:border-slate-700 text-slate-300 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT</span>
          </button>
        </div>
      </header>

      {/* 2. Main Dual-Pane Dashboard */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* Left Side: Control Panel (Tabs, Text Extractor, JSON Editor) */}
        <div className="w-[420px] xl:w-[460px] flex-shrink-0 bg-slate-950 border-r border-slate-900/80 flex flex-col overflow-hidden">
          {/* Preset templates quick selector bar */}
          <div className="px-5 py-3.5 bg-slate-900/30 border-b border-slate-900 flex flex-col gap-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              Select Scenario Template
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => handleSelectScenario(sc.id)}
                  className={`px-2 py-1.5 rounded text-[10px] font-mono font-medium text-left truncate transition-all border ${
                    selectedScenarioId === sc.id
                      ? 'bg-indigo-950/40 text-indigo-300 border-indigo-500/50 shadow-sm shadow-indigo-500/10'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  {sc.name.split(' (')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Editor/Tabs headers */}
          <div className="flex border-b border-slate-900 bg-slate-900/10">
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-3 text-xs font-mono font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                activeTab === 'text'
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-950/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>TEXT EXTRACTOR</span>
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`flex-1 py-3 text-xs font-mono font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                activeTab === 'json'
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-950/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>JSON GRAPH</span>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex-1 py-3 text-xs font-mono font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                activeTab === 'docs'
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-950/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>SCHEMA RULES</span>
            </button>
          </div>

          {/* Left Tab Panels Area */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col min-h-0">
            {activeTab === 'text' && (
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-slate-400">
                    Input Unstructured Narrative Text:
                  </label>
                  <p className="text-[10px] text-slate-500">
                    Feed raw paragraphs, log streams, reports, or fantasy lore. Gemini AI will convert entities to 3D skyscrapers and build connections.
                  </p>
                </div>

                <div className="flex-1 relative min-h-[160px]">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type or paste any story describing entities and relationships..."
                    className="w-full h-full p-3.5 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none font-sans leading-relaxed shadow-inner"
                  />
                </div>

                {/* Submit area */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleExtractGraph}
                    disabled={isExtracting || !inputText.trim()}
                    className={`w-full py-3 rounded-lg font-mono text-xs font-bold tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all ${
                      isExtracting || !inputText.trim()
                        ? 'bg-slate-900 text-slate-500 cursor-not-allowed border border-slate-800'
                        : 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-indigo-600/20 hover:shadow-indigo-500/30 cursor-pointer active:scale-[0.99] border border-indigo-400/20'
                    }`}
                  >
                    {isExtracting ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-300" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-indigo-300" />
                    )}
                    <span>{isExtracting ? 'RUNNING AI PARSER...' : 'EXTRACT 3D CITY MAP'}</span>
                  </button>

                  {/* Loading progress overlay state */}
                  <AnimatePresence>
                    {isExtracting && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg flex flex-col gap-1.5 font-mono text-[9px] text-indigo-300 shadow-inner overflow-hidden"
                      >
                        <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800">
                          <span className="flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-indigo-400 animate-pulse" />
                            <span>AI PIPELINE EXECUTION</span>
                          </span>
                          <span className="animate-pulse">PARSING...</span>
                        </div>
                        {extractionSteps.map((step, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-1.5">
                            <span className="text-emerald-500">✔</span>
                            <span className="text-slate-300">{step}</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* API Key warning details */}
                  {isApiKeyMissing && (
                    <div className="p-3.5 bg-rose-950/20 border border-rose-800/40 rounded-lg text-rose-300 text-xs font-sans flex gap-2">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                      <div>
                        <strong className="block font-semibold mb-1">API Key Missing</strong>
                        To enable server-side Gemini AI parsing, configure your <code className="font-mono bg-rose-950/50 px-1 py-0.5 rounded text-rose-200 text-[10px]">GEMINI_API_KEY</code> in the <strong>Secrets panel</strong> (Settings icon inside Google AI Studio).
                      </div>
                    </div>
                  )}

                  {extractionError && !isApiKeyMissing && (
                    <div className="p-3 bg-rose-950/10 border border-rose-900/30 rounded-lg text-rose-400 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <div className="truncate">{extractionError}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'json' && (
              <div className="flex-1 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    Editable Raw JSON Schema:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleAddNode}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[10px] font-mono rounded text-slate-300 flex items-center gap-1 transition-all"
                    >
                      <Plus className="w-3 h-3 text-emerald-500" />
                      <span>SPAWN NODE</span>
                    </button>
                    <button
                      onClick={handleClearGraph}
                      className="px-2 py-1 bg-slate-900 hover:bg-red-950/30 border border-slate-800 hover:border-red-900/40 text-[10px] font-mono rounded text-slate-400 hover:text-red-300 flex items-center gap-1 transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                      <span>WIPE</span>
                    </button>
                  </div>
                </div>

                {/* Monospace JSON editor field */}
                <div className="flex-1 relative min-h-[160px]">
                  <textarea
                    value={jsonText}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    className={`w-full h-full p-3.5 bg-slate-950 border focus:outline-none rounded-lg font-mono text-[11px] leading-relaxed resize-none shadow-inner ${
                      jsonError
                        ? 'border-red-800 focus:ring-1 focus:ring-red-500/50'
                        : 'border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50'
                    }`}
                  />
                </div>

                {/* Validation Status */}
                <div className="h-6">
                  {jsonError ? (
                    <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="truncate">{jsonError}</span>
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Schema compiled. 3D City representation synced.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'docs' && (
              <div className="flex-1 flex flex-col gap-4 text-xs text-slate-300 leading-relaxed font-sans">
                <div>
                  <h4 className="font-mono text-indigo-300 font-bold mb-1 uppercase text-[11px] tracking-wider">
                    Ontology Guidelines
                  </h4>
                  <p className="text-slate-400">
                    The platform structures entities according to these predefined categories. Colors and building styles in the 3D grid reflect this mapping:
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="p-2.5 rounded border border-slate-900 bg-slate-900/10">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-950/40 text-blue-300 border border-blue-800/40 font-bold mr-2">
                      Person
                    </span>
                    <span className="text-[11px] text-slate-400">Specific individuals, staff, historical agents, or roles.</span>
                  </div>

                  <div className="p-2.5 rounded border border-slate-900 bg-slate-900/10">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 font-bold mr-2">
                      Organization
                    </span>
                    <span className="text-[11px] text-slate-400">Teams, companies, kingdoms, alliances, or syndicate bands.</span>
                  </div>

                  <div className="p-2.5 rounded border border-slate-900 bg-slate-900/10">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-950/40 text-red-300 border border-red-800/40 font-bold mr-2">
                      Infrastructure
                    </span>
                    <span className="text-[11px] text-slate-400">Servers, services, physical locations, fortresses, or software apps.</span>
                  </div>

                  <div className="p-2.5 rounded border border-slate-900 bg-slate-900/10">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950/40 text-amber-300 border border-amber-800/40 font-bold mr-2">
                      Event
                    </span>
                    <span className="text-[11px] text-slate-400">Incident alarms, historical signing treaties, sieges, or outages.</span>
                  </div>

                  <div className="p-2.5 rounded border border-slate-900 bg-slate-900/10">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950/40 text-purple-300 border border-purple-800/40 font-bold mr-2">
                      Concept
                    </span>
                    <span className="text-[11px] text-slate-400">Abstract agreements, trade pacts, protocols, or strategic treaties.</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-mono text-indigo-300 font-bold mb-1 uppercase text-[11px] tracking-wider">
                    Stacked Foundation Slabs
                  </h4>
                  <p className="text-slate-400">
                    Nodes can specify a <code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-indigo-300">"history"</code> array. These events are rendered as physical stacked architectural layers at the base of each building.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: The Interactive 3D Canvas Visualizer & Active Inspector */}
        <div className="flex-1 relative h-full flex flex-col bg-slate-950 overflow-hidden">
          {/* Main 3D Grid Canvas viewport */}
          <div className="flex-1 w-full h-full relative">
            <GraphCanvas
              graphData={graphData}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              hoveredNodeId={hoveredNodeId}
              onHoverNode={setHoveredNodeId}
            />

            {/* Quick tips label overlay */}
            <div className="absolute top-4 right-4 bg-slate-950/60 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 pointer-events-none flex flex-col gap-1 z-10">
              <span className="text-slate-200 uppercase tracking-widest text-[9px] mb-0.5">Quick Controls</span>
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-400 font-bold">• CLICK NODE</span>
                <span>Select & inspect details</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-400 font-bold">• SHIFT + DRAG</span>
                <span>Move building coordinates</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-400 font-bold">• LEFT MOUSE</span>
                <span>Rotate free camera view</span>
              </div>
            </div>
          </div>

          {/* Active Inspector Floating Panel (Holographic details sidebar) */}
          <AnimatePresence>
            {activeNode && activeNodeColors && (
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="absolute right-4 top-24 bottom-24 w-[360px] bg-slate-900/90 border border-slate-800/80 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden flex flex-col z-30"
              >
                {/* Panel Header */}
                <div
                  className="px-5 py-4 border-b border-slate-800 flex items-start justify-between relative"
                  style={{ borderLeftWidth: '4px', borderLeftColor: activeNodeColors.accent.split(' ')[1] }}
                >
                  <div className="flex flex-col gap-1">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border max-w-max uppercase tracking-wider ${activeNodeColors.bg} ${activeNodeColors.text} ${activeNodeColors.border}`}
                    >
                      {activeNode.type}
                    </span>
                    <h3 className="text-sm font-bold tracking-wide text-slate-100 uppercase">
                      {activeNode.label}
                    </h3>
                    <code className="text-[10px] font-mono text-slate-500">
                      ID: {activeNode.id}
                    </code>
                  </div>

                  <button
                    onClick={() => setSelectedNodeId(null)}
                    className="text-slate-500 hover:text-slate-300 text-xs font-mono p-1 rounded hover:bg-slate-800 cursor-pointer"
                  >
                    CLOSE
                  </button>
                </div>

                {/* Panel Body details */}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                  {/* METADATA section */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      <span>ENTITY METADATA</span>
                    </h4>

                    {activeNode.metadata && Object.keys(activeNode.metadata).length > 0 ? (
                      <div className="bg-slate-950/70 rounded-lg border border-slate-800/60 p-3 flex flex-col gap-2">
                        {Object.entries(activeNode.metadata).map(([key, val]) => (
                          <div key={key} className="flex justify-between items-center text-xs font-mono border-b border-slate-900/50 pb-1.5 last:border-0 last:pb-0">
                            <span className="text-slate-500 lowercase">{key}:</span>
                            <span className="text-indigo-200 truncate max-w-[180px]" title={val}>
                              {val}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-slate-500 italic px-1">
                        No specific metadata flags assigned.
                      </p>
                    )}
                  </div>

                  {/* HISTORY TIMELINE stack cards */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      <span>FOUNDATION TIMELINE ({activeNode.history ? activeNode.history.length : 0})</span>
                    </h4>

                    {activeNode.history && activeNode.history.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {activeNode.history.map((hist, idx) => (
                          <div
                            key={idx}
                            className={`p-3 bg-slate-950/50 rounded-lg border border-slate-800/60 text-xs text-slate-300 relative leading-relaxed font-mono flex items-start gap-2.5 hover:border-slate-700/80 transition-all`}
                          >
                            <span className="text-indigo-500 text-[10px] font-bold">0{idx + 1}</span>
                            <span>{hist}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-slate-500 italic px-1">
                        No historical facts or events in foundation.
                      </p>
                    )}
                  </div>

                  {/* CONNECTED RELATIONSHIPS (EDGES) */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" />
                      <span>GRID CONNECTIONS ({directEdges.length})</span>
                    </h4>

                    {directEdges.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {directEdges.map((edge, idx) => {
                          const isSource = edge.source === activeNode.id;
                          const partnerId = isSource ? edge.target : edge.source;
                          const partnerNode = graphData.nodes.find((n) => n.id === partnerId);
                          const partnerConfig = partnerNode ? CATEGORY_COLORS[partnerNode.type] : null;

                          return (
                            <button
                              key={idx}
                              onClick={() => setSelectedNodeId(partnerId)}
                              className="w-full text-left p-2.5 rounded-lg border border-slate-900 bg-slate-950/40 hover:bg-slate-900 hover:border-slate-800 transition-all font-mono text-[11px] flex items-center justify-between group cursor-pointer"
                            >
                              <div className="flex flex-col gap-0.5 max-w-[200px]">
                                <span className="text-slate-500 text-[9px] uppercase tracking-wide">
                                  {isSource ? 'OUTGOING LINK' : 'INCOMING LINK'}
                                </span>
                                <span className="text-slate-200 font-bold group-hover:text-indigo-300 transition-colors truncate">
                                  {partnerNode ? partnerNode.label : partnerId}
                                </span>
                              </div>

                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold uppercase">
                                  {edge.relation}
                                </span>
                                {partnerNode && partnerConfig && (
                                  <span className={`text-[8px] font-bold uppercase ${partnerConfig.text}`}>
                                    {partnerNode.type}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-slate-500 italic px-1">
                        Isolated entity on grid. No linkages.
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
