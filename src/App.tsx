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

// Restored Ontology Colors (UI overlays will pop against the monochrome Zinc background)
const CATEGORY_COLORS: Record<NodeType, { bg: string; text: string; border: string; accent: string }> = {
  Person: { bg: 'bg-blue-950/40', text: 'text-blue-300', border: 'border-blue-800/50', accent: 'bg-blue-500' },
  Organization: { bg: 'bg-emerald-950/40', text: 'text-emerald-300', border: 'border-emerald-800/50', accent: 'bg-emerald-500' },
  Infrastructure: { bg: 'bg-red-950/40', text: 'text-red-300', border: 'border-red-800/50', accent: 'bg-red-500' },
  Event: { bg: 'bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-800/50', accent: 'bg-amber-500' },
  Concept: { bg: 'bg-purple-950/40', text: 'text-purple-300', border: 'border-purple-800/50', accent: 'bg-purple-500' },
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
    <div className="flex flex-col w-screen h-screen bg-black text-zinc-200 overflow-hidden font-sans">
      {/* 1. Header Navigation Bar */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-black border-b border-zinc-800 z-10">
        <div className="flex items-center gap-3">
          <div className="relative p-2 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide uppercase text-white">
              GraphRAG City
            </h1>
            <p className="text-[10px] font-mono text-zinc-500">
              3D Cityscape Entity Extractor & Layout Engine
            </p>
          </div>
        </div>

        {/* Top middle status block - Clean monochrome, no pulsing indicators */}
        <div className="hidden md:flex items-center gap-4 text-[10px] font-mono">
          <div className="flex items-center gap-2 text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800/60">
            <span>MODEL: <strong className="text-zinc-100">gemini-3.5-flash</strong></span>
          </div>

          <div className="flex items-center gap-2 text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800/60">
            <span>NODES: <strong className="text-zinc-100">{graphData.nodes.length}</strong></span>
          </div>

          <div className="flex items-center gap-2 text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800/60">
            <span>EDGES: <strong className="text-zinc-100">{graphData.edges.length}</strong></span>
          </div>
        </div>

        {/* Right download controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono rounded border border-zinc-800 text-zinc-300 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>EXPORT</span>
          </button>
        </div>
      </header>

      {/* 2. Main Dual-Pane Dashboard */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* Left Side: Control Panel (Tabs, Text Extractor, JSON Editor) */}
        <div className="w-[420px] xl:w-[460px] flex-shrink-0 bg-black border-r border-zinc-900 flex flex-col overflow-hidden">
          {/* Preset templates quick selector bar */}
          <div className="px-5 py-3.5 bg-black border-b border-zinc-900 flex flex-col gap-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Select Scenario Template
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => handleSelectScenario(sc.id)}
                  className={`px-2 py-1.5 rounded text-[10px] font-mono font-medium text-left truncate transition-all border ${
                    selectedScenarioId === sc.id
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  {sc.name.split(' (')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Editor/Tabs headers */}
          <div className="flex border-b border-zinc-900 bg-black">
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-3 text-xs font-mono font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                activeTab === 'text'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>TEXT EXTRACTOR</span>
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`flex-1 py-3 text-xs font-mono font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                activeTab === 'json'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>JSON GRAPH</span>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex-1 py-3 text-xs font-mono font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                activeTab === 'docs'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>SCHEMA RULES</span>
            </button>
          </div>

          {/* Left Tab Panels Area */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col min-h-0 bg-black">
            {activeTab === 'text' && (
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-400">
                    Input Unstructured Narrative Text:
                  </label>
                  <p className="text-[10px] text-zinc-500">
                    Feed raw paragraphs, log streams, reports, or fantasy lore. Gemini AI will convert entities to 3D skyscrapers and build connections.
                  </p>
                </div>

                <div className="flex-1 relative min-h-[160px]">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type or paste any story describing entities and relationships..."
                    className="w-full h-full p-3.5 bg-black border border-zinc-800 hover:border-zinc-700 focus:border-zinc-300 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/15 resize-none font-sans leading-relaxed"
                  />
                </div>

                {/* Submit area */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleExtractGraph}
                    disabled={isExtracting || !inputText.trim()}
                    className={`w-full py-2.5 rounded font-mono text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-all ${
                      isExtracting || !inputText.trim()
                        ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-850'
                        : 'bg-white hover:bg-zinc-200 text-black cursor-pointer active:scale-[0.99] border border-transparent'
                    }`}
                  >
                    {isExtracting ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-zinc-600" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-black" />
                    )}
                    <span>{isExtracting ? 'RUNNING AI PARSER...' : 'EXTRACT 3D CITY MAP'}</span>
                  </button>

                  {/* Loading progress overlay state - clean monochrome */}
                  <AnimatePresence>
                    {isExtracting && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 bg-zinc-900/60 border border-zinc-800 rounded flex flex-col gap-1.5 font-mono text-[9px] text-zinc-300 overflow-hidden"
                      >
                        <div className="flex items-center justify-between text-zinc-400 pb-1 border-b border-zinc-800">
                          <span className="flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-zinc-400" />
                            <span>AI PIPELINE EXECUTION</span>
                          </span>
                          <span>PARSING...</span>
                        </div>
                        {extractionSteps.map((step, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-1.5 text-zinc-400">
                            <span className="text-zinc-500">•</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* API Key warning details - Monochrome style */}
                  {isApiKeyMissing && (
                    <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 text-xs font-sans flex gap-2 animate-fade-in">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-zinc-300" />
                      <div>
                        <strong className="block font-semibold mb-1 text-white">API Key Config Required</strong>
                        To enable server-side Gemini AI parsing, configure your <code className="font-mono bg-zinc-900 px-1 py-0.5 rounded text-white text-[10px]">GEMINI_API_KEY</code> in the <strong>Secrets panel</strong> (Settings icon inside Google AI Studio).
                      </div>
                    </div>
                  )}

                  {extractionError && !isApiKeyMissing && (
                    <div className="p-3 bg-zinc-950 border border-zinc-855 rounded text-zinc-400 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div className="truncate">{extractionError}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'json' && (
              <div className="flex-1 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-400">
                    Editable Raw JSON Schema:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleAddNode}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono rounded text-zinc-300 flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-zinc-300" />
                      <span>SPAWN NODE</span>
                    </button>
                    <button
                      onClick={handleClearGraph}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono rounded text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 text-zinc-400" />
                      <span>WIPE</span>
                    </button>
                  </div>
                </div>

                {/* Monospace JSON editor field */}
                <div className="flex-1 relative min-h-[160px]">
                  <textarea
                    value={jsonText}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    className={`w-full h-full p-3.5 bg-black border focus:outline-none rounded font-mono text-[11px] leading-relaxed resize-none ${
                      jsonError
                        ? 'border-zinc-750 focus:ring-1 focus:ring-zinc-500/50'
                        : 'border-zinc-800 focus:border-zinc-300 focus:ring-1 focus:ring-white/10'
                    }`}
                  />
                </div>

                {/* Validation Status */}
                <div className="h-6">
                  {jsonError ? (
                    <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="truncate">{jsonError}</span>
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Schema compiled. 3D City representation synced.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'docs' && (
              <div className="flex-1 flex flex-col gap-4 text-xs text-zinc-350 leading-relaxed font-sans">
                <div>
                  <h4 className="font-mono text-white font-bold mb-1 uppercase text-[10px] tracking-wider">
                    Ontology Guidelines
                  </h4>
                  <p className="text-zinc-500">
                    The platform structures entities according to these predefined categories. Colors and building styles in the 3D grid reflect this mapping:
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="p-2.5 rounded border border-zinc-900 bg-zinc-950">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold mr-2">
                      Person
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">Specific individuals, staff, historical agents, or roles.</span>
                  </div>

                  <div className="p-2.5 rounded border border-zinc-900 bg-zinc-950">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold mr-2">
                      Organization
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">Teams, companies, kingdoms, alliances, or syndicate bands.</span>
                  </div>

                  <div className="p-2.5 rounded border border-zinc-900 bg-zinc-950">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold mr-2">
                      Infrastructure
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">Servers, services, physical locations, fortresses, or software apps.</span>
                  </div>

                  <div className="p-2.5 rounded border border-zinc-900 bg-zinc-950">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold mr-2">
                      Event
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">Incident alarms, historical signing treaties, sieges, or outages.</span>
                  </div>

                  <div className="p-2.5 rounded border border-zinc-900 bg-zinc-950">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold mr-2">
                      Concept
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">Abstract agreements, trade pacts, protocols, or strategic treaties.</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-mono text-white font-bold mb-1 uppercase text-[10px] tracking-wider">
                    Stacked Foundation Slabs
                  </h4>
                  <p className="text-zinc-500">
                    Nodes can specify a <code className="font-mono bg-zinc-900 px-1 py-0.5 rounded text-white text-[10px]">"history"</code> array. These events are rendered as physical stacked architectural layers at the base of each building.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: The Interactive 3D Canvas Visualizer & Active Inspector */}
        <div className="flex-1 relative h-full flex flex-col bg-black overflow-hidden">
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
            <div className="absolute top-4 right-4 bg-black/90 px-3 py-2.5 rounded border border-zinc-800 text-[10px] font-mono text-zinc-400 pointer-events-none flex flex-col gap-1 z-10 shadow-lg">
              <span className="text-zinc-200 uppercase tracking-wide text-[9px] mb-0.5 border-b border-zinc-800 pb-1">Quick Controls</span>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-100 font-bold">• CLICK NODE</span>
                <span>Select & inspect details</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-100 font-bold">• SHIFT + DRAG</span>
                <span>Move building coordinates</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-100 font-bold">• LEFT MOUSE</span>
                <span>Rotate free camera view</span>
              </div>
            </div>
          </div>

          {/* Active Inspector Floating Panel (Monochrome details sidebar) */}
          <AnimatePresence>
            {activeNode && activeNodeColors && (
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="absolute right-4 top-24 bottom-24 w-[340px] bg-black border border-zinc-800 shadow-2xl overflow-hidden flex flex-col z-30"
              >
                {/* Panel Header */}
                <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between relative">
                  <div className="flex flex-col gap-1">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border max-w-max uppercase tracking-wider bg-zinc-900 text-zinc-300 border-zinc-800">
                      {activeNode.type}
                    </span>
                    <h3 className="text-sm font-bold tracking-wide text-zinc-100 uppercase">
                      {activeNode.label}
                    </h3>
                    <code className="text-[10px] font-mono text-zinc-500">
                      ID: {activeNode.id}
                    </code>
                  </div>

                  <button
                    onClick={() => setSelectedNodeId(null)}
                    className="text-zinc-400 hover:text-white text-xs font-mono p-1 rounded hover:bg-zinc-900 cursor-pointer transition-colors"
                  >
                    CLOSE
                  </button>
                </div>

                {/* Panel Body details */}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 bg-black">
                  {/* METADATA section */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      <span>ENTITY METADATA</span>
                    </h4>

                    {activeNode.metadata && Object.keys(activeNode.metadata).length > 0 ? (
                      <div className="bg-zinc-950 rounded border border-zinc-800/80 p-3 flex flex-col gap-2">
                        {Object.entries(activeNode.metadata).map(([key, val]) => (
                          <div key={key} className="flex justify-between items-center text-xs font-mono border-b border-zinc-900/50 pb-1.5 last:border-0 last:pb-0">
                            <span className="text-zinc-500 lowercase">{key}:</span>
                            <span className="text-zinc-200 truncate max-w-[160px]" title={val}>
                              {val}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-zinc-600 italic px-1">
                        No specific metadata flags assigned.
                      </p>
                    )}
                  </div>

                  {/* HISTORY TIMELINE stack cards */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      <span>FOUNDATION TIMELINE ({activeNode.history ? activeNode.history.length : 0})</span>
                    </h4>

                    {activeNode.history && activeNode.history.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {activeNode.history.map((hist, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-zinc-950 rounded border border-zinc-800/80 text-xs text-zinc-300 relative leading-relaxed font-mono flex items-start gap-2.5 hover:border-zinc-700/80 transition-all"
                          >
                            <span className="text-zinc-500 text-[10px] font-bold">0{idx + 1}</span>
                            <span>{hist}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-zinc-600 italic px-1">
                        No historical facts or events in foundation.
                      </p>
                    )}
                  </div>

                  {/* CONNECTED RELATIONSHIPS (EDGES) */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" />
                      <span>GRID CONNECTIONS ({directEdges.length})</span>
                    </h4>

                    {directEdges.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {directEdges.map((edge, idx) => {
                          const isSource = edge.source === activeNode.id;
                          const partnerId = isSource ? edge.target : edge.source;
                          const partnerNode = graphData.nodes.find((n) => n.id === partnerId);

                          return (
                            <button
                              key={idx}
                              onClick={() => setSelectedNodeId(partnerId)}
                              className="w-full text-left p-2.5 rounded border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-800 transition-all font-mono text-[11px] flex items-center justify-between group cursor-pointer"
                            >
                              <div className="flex flex-col gap-0.5 max-w-[180px]">
                                <span className="text-zinc-500 text-[9px] uppercase tracking-wide">
                                  {isSource ? 'OUTGOING LINK' : 'INCOMING LINK'}
                                </span>
                                <span className="text-zinc-300 font-bold group-hover:text-white transition-colors truncate">
                                  {partnerNode ? partnerNode.label : partnerId}
                                </span>
                              </div>

                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold uppercase">
                                  {edge.relation}
                                </span>
                                {partnerNode && (
                                  <span className="text-[8px] font-bold uppercase text-zinc-500">
                                    {partnerNode.type}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-zinc-600 italic px-1">
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
