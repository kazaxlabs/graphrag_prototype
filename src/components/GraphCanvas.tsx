/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, MouseEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore
import ELK from 'elkjs/lib/elk.bundled.js';
import * as d3 from 'd3';
import { GraphData, Node, Edge, NodeType } from '../types';

const elk = new ELK();

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  node: Node;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
}

function runD3Simulation(nodes: Node[], edges: Edge[]): Map<string, { x: number; z: number }> {
  if (nodes.length === 0) {
    return new Map();
  }

  // Map standard nodes to D3 simulation nodes
  const d3Nodes: D3Node[] = nodes.map((node, index) => {
    // Distribute initially in a circle to allow forces to expand them smoothly
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    const radius = 6 + Math.random() * 4;
    return {
      id: node.id,
      node: node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  // Deep copy edges for D3 simulation
  const d3Edges: D3Link[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  // Define custom grid alignment force (pulls nodes to grid cell multiples)
  const gridForce = () => {
    let simNodes: D3Node[] = [];
    const cellSize = 6.0; // Size of each block cell in the grid (e.g. 6x6 units)
    const strength = 0.35; // Strength of snap/grid attraction
    
    function force(alpha: number) {
      for (let i = 0; i < simNodes.length; i++) {
        const node = simNodes[i];
        if (node.x === undefined || node.y === undefined) continue;
        
        // Find nearest grid block center coordinate
        const targetX = Math.round(node.x / cellSize) * cellSize;
        const targetY = Math.round(node.y / cellSize) * cellSize;
        
        node.vx = (node.vx || 0) + (targetX - node.x) * strength * alpha;
        node.vy = (node.vy || 0) + (targetY - node.y) * strength * alpha;
      }
    }
    
    force.initialize = (_nodes: D3Node[]) => {
      simNodes = _nodes;
    };
    return force;
  };

  // Build the D3 force simulation
  const simulation = d3.forceSimulation<D3Node>(d3Nodes)
    .force("charge", d3.forceManyBody().strength(-140))
    .force("link", d3.forceLink<D3Node, D3Link>(d3Edges)
      .id((d) => d.id)
      .distance(10)
      .strength(0.7)
    )
    .force("center", d3.forceCenter(0, 0))
    .force("collision", d3.forceCollide().radius(4.5))
    .force("grid", gridForce())
    .stop();

  // Tick the simulation offline 200 times to let it settle into grid arrangement
  for (let i = 0; i < 200; i++) {
    simulation.tick();
  }

  // Create lookup map of results
  const resultMap = new Map<string, { x: number; z: number }>();
  d3Nodes.forEach((dn) => {
    resultMap.set(dn.id, {
      x: dn.x !== undefined ? Math.max(-28, Math.min(28, dn.x)) : 0,
      z: dn.y !== undefined ? Math.max(-28, Math.min(28, dn.y)) : 0,
    });
  });

  return resultMap;
}

// Helper to calculate the shortest distance from a 2D point (px, py) to a 2D line segment (x1, y1) - (x2, y2)
function getDistanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  
  // Projection factor
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment boundaries
  
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

const CATEGORIES: Array<NodeType | 'All'> = ['All', 'Person', 'Organization', 'Infrastructure', 'Event', 'Concept'];

interface GraphCanvasProps {
  graphData: GraphData;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  hoveredNodeId: string | null;
  onHoverNode: (nodeId: string | null) => void;
}

// Visual configurations for Ontology Types
const TYPE_CONFIGS: Record<NodeType, { color: string; hex: number; emissive: number }> = {
  Person: { color: '#3b82f6', hex: 0x3b82f6, emissive: 0x1d4ed8 }, // Blue
  Organization: { color: '#10b981', hex: 0x10b981, emissive: 0x047857 }, // Emerald
  Infrastructure: { color: '#ef4444', hex: 0xef4444, emissive: 0xb91c1c }, // Red
  Event: { color: '#f59e0b', hex: 0xf59e0b, emissive: 0xb45309 }, // Amber
  Concept: { color: '#8b5cf6', hex: 0x8b5cf6, emissive: 0x6d28d9 }, // Violet
};

interface PhysicsNode {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  node: Node;
  height: number;
}

export default function GraphCanvas({
  graphData,
  selectedNodeId,
  onSelectNode,
  hoveredNodeId,
  onHoverNode,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Layout controls state
  const [isIsometric, setIsIsometric] = useState(true);
  const [enablePhysics, setEnablePhysics] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<NodeType | 'All'>('All');

  // Active hovered relation (edge)
  const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const edgeLinesRef = useRef<THREE.LineSegments | null>(null);
  const groundGridRef = useRef<THREE.GridHelper | null>(null);

  // Physics simulation state stored in ref for the animation loop
  const physicsNodesRef = useRef<Map<string, PhysicsNode>>(new Map());
  const draggingNodeIdRef = useRef<string | null>(null);
  const dragPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

  // Projected 2D screen positions of nodes for rendering HTML labels
  const [projectedLabels, setProjectedLabels] = useState<
    Array<{ id: string; label: string; type: NodeType; x: number; y: number; height: number }>
  >([]);

  // Store the processed ELK coordinates
  const [layout, setLayout] = useState<any>(null);

  // Store the processed D3 coordinates
  const [d3Positions, setD3Positions] = useState<Map<string, { x: number; z: number }>>(new Map());

  // Automatically trigger D3 force-directed simulation when data is loaded
  useEffect(() => {
    if (graphData.nodes.length > 0) {
      const positions = runD3Simulation(graphData.nodes, graphData.edges);
      setD3Positions(positions);
    } else {
      setD3Positions(new Map());
    }
  }, [graphData]);

  // Calculate hierarchical layout using ELK engine
  useEffect(() => {
    let isMounted = true;
    const calculateCityGrid = async () => {
      // 1. SANITIZE DATA: Strip out "ghost edges" pointing to non-existent nodes
      const validNodeIds = new Set(graphData.nodes.map(n => n.id));
      const validEdges = graphData.edges.filter(
        e => validNodeIds.has(e.source) && validNodeIds.has(e.target)
      );

      const elkGraph = {
        id: "root",
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'DOWN',
          'elk.edgeRouting': 'ORTHOGONAL',
          'elk.spacing.nodeNode': '100', // Increased spacing for a true city block feel
          'elk.spacing.edgeNode': '50'
        },
        children: graphData.nodes.map(node => ({
          id: node.id,
          width: 10,  // Base size unit for ELK math
          height: 10,
          ...node
        })),
        edges: validEdges.map((edge, index) => ({
          id: `edge_${index}`,
          sources: [edge.source],
          targets: [edge.target],
          ...edge
        }))
      };

      try {
        const processedLayout = await elk.layout(elkGraph);
        if (isMounted) {
          setLayout(processedLayout);
        }
      } catch (error) {
        console.error("ELK Layout Fatal Math Error:", error);
      }
    };

    if (graphData.nodes.length > 0) {
      calculateCityGrid();
    } else {
      if (isMounted) {
        setLayout(null);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [graphData]);

  // 1. Initialize Scene, Camera, Lights and Renderer
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Create Scene with space background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.008);
    sceneRef.current = scene;

    // Create Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Create Cameras (Orthographic for Iso, Perspective for Free Orbit)
    let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
    if (isIsometric) {
      const aspect = width / height;
      const d = 25; // Matching d size to perfectly frame the larger city blocks layout
      camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 1000); // Standard positive near plane to avoid depth/shadow glitches
      camera.position.set(40, 40, 40); // Elegantly pulled back isometric angle
    } else {
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(40, 40, 40); // Consistent perspective angle
    }
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.minDistance = 3;
    controls.maxDistance = 200; // Increased to allow viewing the larger grid layout
    controlsRef.current = controls;

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambientLight);

    // Dynamic monochrome atmospheric point lights
    const pointLight1 = new THREE.PointLight(0xffffff, 0.8, 35);
    pointLight1.position.set(-15, 5, -15);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xffffff, 0.6, 35);
    pointLight2.position.set(15, 5, 15);
    scene.add(pointLight2);

    // Sun directional light casting shadows
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(20, 30, 15);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;
    const shadowSize = 25;
    if (isIsometric) {
      const orthoCam = camera as THREE.OrthographicCamera;
      sunLight.shadow.camera.left = -shadowSize;
      sunLight.shadow.camera.right = shadowSize;
      sunLight.shadow.camera.top = shadowSize;
      sunLight.shadow.camera.bottom = -shadowSize;
    }
    scene.add(sunLight);

    // Digital Grid ground helper
    const grid = new THREE.GridHelper(80, 80, 0x444444, 0x161616);
    grid.position.y = -0.01;
    scene.add(grid);
    groundGridRef.current = grid;

    // Ground reflector slab
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.8,
      metalness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // Handle Window Resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;

      rendererRef.current.setSize(w, h);

      if (cameraRef.current instanceof THREE.PerspectiveCamera) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
      } else if (cameraRef.current instanceof THREE.OrthographicCamera) {
        const aspect = w / h;
        const d = 25; // Matching d size to perfectly frame the larger city blocks layout
        cameraRef.current.left = -d * aspect;
        cameraRef.current.right = d * aspect;
        cameraRef.current.top = d;
        cameraRef.current.bottom = -d;
        cameraRef.current.updateProjectionMatrix();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [isIsometric]);

  // 2. Sync graphData and layout to physics nodes and generate 3D meshes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !layout) return;

    // Clean old meshes
    nodeMeshesRef.current.forEach((mesh) => scene.remove(mesh));
    nodeMeshesRef.current.clear();

    if (edgeLinesRef.current) {
      scene.remove(edgeLinesRef.current);
      edgeLinesRef.current = null;
    }

    const nextPhysicsNodes = new Map<string, PhysicsNode>();

    // Center coordinates around (0,0) and scale to 80x80 units grid
    const centerX = layout.width ? layout.width / 2 : 0;
    const centerY = layout.height ? layout.height / 2 : 0;
    const maxDimension = Math.max(layout.width || 1, layout.height || 1, 400);
    const scale = 40 / maxDimension; // Fits nicely inside grid boundaries

    // Map each child position from ELK layout
    const elkChildrenMap = new Map<string, { x: number; z: number }>();
    if (layout.children) {
      layout.children.forEach((child: any) => {
        const childW = child.width || 100;
        const childH = child.height || 100;
        elkChildrenMap.set(child.id, {
          x: (child.x + childW / 2 - centerX) * scale,
          z: (child.y + childH / 2 - centerY) * scale,
        });
      });
    }

    // Transform static ELK point helpers
    const transformPoint = (p: { x: number; y: number }) => {
      return {
        x: (p.x - centerX) * scale,
        z: (p.y - centerY) * scale,
      };
    };

    // Determine physics nodes positions, maintaining state
    graphData.nodes.forEach((node) => {
      const existing = physicsNodesRef.current.get(node.id);
      const d3Pos = d3Positions.get(node.id);
      const elkPos = elkChildrenMap.get(node.id);

      // Node skyscraper height based on data complexity
      const historyCount = node.history ? node.history.length : 0;
      const metadataCount = node.metadata ? Object.keys(node.metadata).length : 0;
      const height = 0.8 + historyCount * 0.4 + metadataCount * 0.2;

      // Prioritize D3 positions, fallback to ELK, then existing, then 0
      const startX = d3Pos ? d3Pos.x : (elkPos ? elkPos.x : (existing ? existing.x : 0));
      const startZ = d3Pos ? d3Pos.z : (elkPos ? elkPos.z : (existing ? existing.z : 0));

      if (existing) {
        nextPhysicsNodes.set(node.id, {
          ...existing,
          x: draggingNodeIdRef.current === node.id ? existing.x : startX,
          z: draggingNodeIdRef.current === node.id ? existing.z : startZ,
          node,
          height,
        });
      } else {
        nextPhysicsNodes.set(node.id, {
          id: node.id,
          x: startX,
          z: startZ,
          vx: 0,
          vz: 0,
          node,
          height,
        });
      }
    });

    physicsNodesRef.current = nextPhysicsNodes;

    // Create 3D meshes for each node
    graphData.nodes.forEach((node) => {
      const physNode = physicsNodesRef.current.get(node.id)!;
      const config = TYPE_CONFIGS[node.type] || { color: '#94a3b8', hex: 0x94a3b8, emissive: 0x475569 };

      const nodeGroup = new THREE.Group();

      // Skyscraper Block Geometry
      const buildingWidth = 1.6;
      const buildingDepth = 1.6;
      const buildingGeo = new THREE.BoxGeometry(buildingWidth, physNode.height, buildingDepth);

      // Cyberpunk glowing strip shader-like material
      const buildingMat = new THREE.MeshStandardMaterial({
        color: config.hex,
        roughness: 0.15,
        metalness: 0.8,
        emissive: config.emissive,
        emissiveIntensity: selectedNodeId === node.id ? 1.4 : hoveredNodeId === node.id ? 0.9 : 0.25,
      });

      const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
      buildingMesh.position.y = physNode.height / 2; // Sit exactly on ground
      buildingMesh.castShadow = true;
      buildingMesh.receiveShadow = true;
      buildingMesh.userData = { nodeId: node.id, isBuilding: true };
      nodeGroup.add(buildingMesh);

      // Architectural Foundation Layers represent node history stack!
      const historyCount = node.history ? node.history.length : 0;
      for (let h = 0; h < historyCount; h++) {
        // Render stacked slabs under the building or at its base
        const slabY = (h + 1) * 0.12;
        const slabWidth = buildingWidth + 0.35 - h * 0.08;
        const slabGeo = new THREE.BoxGeometry(slabWidth, 0.08, slabWidth);
        const slabMat = new THREE.MeshStandardMaterial({
          color: 0x161616,
          roughness: 0.4,
          metalness: 0.9,
          emissive: config.emissive,
          emissiveIntensity: 0.15,
        });
        const slabMesh = new THREE.Mesh(slabGeo, slabMat);
        slabMesh.position.y = slabY;
        slabMesh.receiveShadow = true;
        nodeGroup.add(slabMesh);
      }

      // Floating Holographic Antennas on top of buildings
      if (node.type === 'Infrastructure' || node.type === 'Event') {
        const antennaGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
        const antennaMat = new THREE.MeshBasicMaterial({ color: config.hex });
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.y = physNode.height + 0.3;
        nodeGroup.add(antenna);

        const beaconGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.y = physNode.height + 0.6;
        nodeGroup.add(beacon);
      }

      // Add building window light lines for cyberpunk effect
      const wireGeo = new THREE.EdgesGeometry(buildingGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: config.hex,
        linewidth: 1.5,
      });
      const wireframe = new THREE.LineSegments(wireGeo, wireMat);
      wireframe.position.y = physNode.height / 2;
      wireframe.scale.setScalar(1.01);
      nodeGroup.add(wireframe);

      nodeGroup.position.set(physNode.x, 0, physNode.z);
      scene.add(nodeGroup);
      nodeMeshesRef.current.set(node.id, nodeGroup);
    });

    // Create Edge connections (lines)
    const edgePositions: number[] = [];
    const edgeColors: number[] = [];

    const hasFocus = !!selectedNodeId || !!hoveredNodeId || !!hoveredEdge || searchQuery.trim().length > 0 || selectedCategory !== 'All';

    // If physics is paused, render orthogonal street segments computed by ELK!
    if (!enablePhysics && layout.edges) {
      layout.edges.forEach((elkEdge: any) => {
        const sourceNode = graphData.nodes.find((n) => n.id === elkEdge.source);
        const targetNode = graphData.nodes.find((n) => n.id === elkEdge.target);
        if (!sourceNode || !targetNode) return;

        const sourceColor = TYPE_CONFIGS[sourceNode.type]?.color || '#ffffff';
        const targetColor = TYPE_CONFIGS[targetNode.type]?.color || '#ffffff';
        const sCol = new THREE.Color(sourceColor);
        const tCol = new THREE.Color(targetColor);

        // Highlight check
        const isHovered = hoveredEdge && 
          ((hoveredEdge.source === elkEdge.source && hoveredEdge.target === elkEdge.target) || 
           (hoveredEdge.target === elkEdge.source && hoveredEdge.source === elkEdge.target));
        const isConnectedToHovered = hoveredNodeId === elkEdge.source || hoveredNodeId === elkEdge.target;
        const isConnectedToSelected = selectedNodeId === elkEdge.source || selectedNodeId === elkEdge.target;

        const sourceMatchesSearch = searchQuery.trim() === '' || 
          sourceNode.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
          sourceNode.id.toLowerCase().includes(searchQuery.toLowerCase());
        const targetMatchesSearch = searchQuery.trim() === '' || 
          targetNode.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
          targetNode.id.toLowerCase().includes(searchQuery.toLowerCase());
        
        const sourceMatchesCategory = selectedCategory === 'All' || sourceNode.type === selectedCategory;
        const targetMatchesCategory = selectedCategory === 'All' || targetNode.type === selectedCategory;

        const isSourceMatched = sourceMatchesSearch && sourceMatchesCategory;
        const isTargetMatched = targetMatchesSearch && targetMatchesCategory;

        const matchesActiveFilters = hasFocus && (isSourceMatched || isTargetMatched);
        const isHighlighted = isHovered || isConnectedToHovered || isConnectedToSelected || matchesActiveFilters;

        if (elkEdge.sections) {
          elkEdge.sections.forEach((section: any) => {
            const points: { x: number; z: number }[] = [];

            if (section.startPoint) {
              points.push(transformPoint(section.startPoint));
            }
            if (section.bendPoints) {
              section.bendPoints.forEach((bp: any) => {
                points.push(transformPoint(bp));
              });
            }
            if (section.endPoint) {
              points.push(transformPoint(section.endPoint));
            }

            for (let i = 0; i < points.length - 1; i++) {
              const p1 = points[i];
              const p2 = points[i + 1];

              edgePositions.push(p1.x, 0.15, p1.z);
              edgePositions.push(p2.x, 0.15, p2.z);

              const ratio = i / Math.max(points.length - 1, 1);
              const segmentCol = sCol.clone().lerp(tCol, ratio);
              const nextSegmentCol = sCol.clone().lerp(tCol, (i + 1) / Math.max(points.length - 1, 1));

              let r1 = segmentCol.r;
              let g1 = segmentCol.g;
              let b1 = segmentCol.b;
              let r2 = nextSegmentCol.r;
              let g2 = nextSegmentCol.g;
              let b2 = nextSegmentCol.b;

              if (!isHighlighted && hasFocus) {
                const dimFactor = 0.08;
                r1 *= dimFactor; g1 *= dimFactor; b1 *= dimFactor;
                r2 *= dimFactor; g2 *= dimFactor; b2 *= dimFactor;
              } else if (!hasFocus) {
                const normFactor = 0.7;
                r1 *= normFactor; g1 *= normFactor; b1 *= normFactor;
                r2 *= normFactor; g2 *= normFactor; b2 *= normFactor;
              }

              edgeColors.push(r1, g1, b1);
              edgeColors.push(r2, g2, b2);
            }
          });
        }
      });
    } else {
      // Direct straight line representation between active physics coordinates
      graphData.edges.forEach((edge) => {
        const sourceNode = physicsNodesRef.current.get(edge.source);
        const targetNode = physicsNodesRef.current.get(edge.target);

        if (sourceNode && targetNode) {
          const sourceColor = TYPE_CONFIGS[sourceNode.node.type]?.color || '#ffffff';
          const targetColor = TYPE_CONFIGS[targetNode.node.type]?.color || '#ffffff';

          const sCol = new THREE.Color(sourceColor);
          const tCol = new THREE.Color(targetColor);

          // Highlight check
          const isHovered = hoveredEdge === edge || 
            (hoveredEdge && hoveredEdge.source === edge.source && hoveredEdge.target === edge.target);
          const isConnectedToHovered = hoveredNodeId === edge.source || hoveredNodeId === edge.target;
          const isConnectedToSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;

          const sourceMatchesSearch = searchQuery.trim() === '' || 
            sourceNode.node.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
            sourceNode.node.id.toLowerCase().includes(searchQuery.toLowerCase());
          const targetMatchesSearch = searchQuery.trim() === '' || 
            targetNode.node.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
            targetNode.node.id.toLowerCase().includes(searchQuery.toLowerCase());
          
          const sourceMatchesCategory = selectedCategory === 'All' || sourceNode.node.type === selectedCategory;
          const targetMatchesCategory = selectedCategory === 'All' || targetNode.node.type === selectedCategory;

          const isSourceMatched = sourceMatchesSearch && sourceMatchesCategory;
          const isTargetMatched = targetMatchesSearch && targetMatchesCategory;

          const matchesActiveFilters = hasFocus && (isSourceMatched || isTargetMatched);
          const isHighlighted = isHovered || isConnectedToHovered || isConnectedToSelected || matchesActiveFilters;

          edgePositions.push(sourceNode.x, 0.15, sourceNode.z);
          edgePositions.push(targetNode.x, 0.15, targetNode.z);

          let r1 = sCol.r;
          let g1 = sCol.g;
          let b1 = sCol.b;
          let r2 = tCol.r;
          let g2 = tCol.g;
          let b2 = tCol.b;

          if (!isHighlighted && hasFocus) {
            const dimFactor = 0.08;
            r1 *= dimFactor; g1 *= dimFactor; b1 *= dimFactor;
            r2 *= dimFactor; g2 *= dimFactor; b2 *= dimFactor;
          } else if (!hasFocus) {
            const normFactor = 0.7;
            r1 *= normFactor; g1 *= normFactor; b1 *= normFactor;
            r2 *= normFactor; g2 *= normFactor; b2 *= normFactor;
          }

          edgeColors.push(r1, g1, b1);
          edgeColors.push(r2, g2, b2);
        }
      });
    }

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    edgeGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));

    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });

    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(edgeLines);
    edgeLinesRef.current = edgeLines;
  }, [graphData, layout, d3Positions, enablePhysics, selectedNodeId, hoveredNodeId, isIsometric, hoveredEdge, searchQuery, selectedCategory]);

  // 3. Update building glowing intensity on hover/selection
  useEffect(() => {
    const hasFocus = !!selectedNodeId || !!hoveredNodeId || !!hoveredEdge || searchQuery.trim().length > 0 || selectedCategory !== 'All';

    graphData.nodes.forEach((node) => {
      const group = nodeMeshesRef.current.get(node.id);
      if (!group) return;

      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;

      // Check search & category matches
      const matchesSearch = searchQuery.trim() === '' || 
        node.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
        node.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.type.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === 'All' || node.type === selectedCategory;
      const isFilterMatched = matchesSearch && matchesCategory;

      // Check connections
      const isConnectedToHovered = hoveredNodeId ? graphData.edges.some(
        e => (e.source === hoveredNodeId && e.target === node.id) || (e.target === hoveredNodeId && e.source === node.id)
      ) : false;

      const isConnectedToSelected = selectedNodeId ? graphData.edges.some(
        e => (e.source === selectedNodeId && e.target === node.id) || (e.target === selectedNodeId && e.source === node.id)
      ) : false;

      const isConnectedToHoveredEdge = hoveredEdge ? (
        hoveredEdge.source === node.id || hoveredEdge.target === node.id
      ) : false;

      // Determine final visual level: 'highlight' | 'normal' | 'dimmed'
      let visualState: 'highlight' | 'normal' | 'dimmed' = 'normal';
      
      if (isSelected || isHovered) {
        visualState = 'highlight';
      } else if (isConnectedToHovered || isConnectedToSelected || isConnectedToHoveredEdge) {
        visualState = 'highlight';
      } else if (hasFocus && isFilterMatched) {
        visualState = 'highlight';
      } else if (hasFocus) {
        visualState = 'dimmed';
      }

      const config = TYPE_CONFIGS[node.type];
      if (!config) return;

      group.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.transparent = true;
            if (visualState === 'highlight') {
              child.material.opacity = 1.0;
              child.material.emissiveIntensity = isSelected ? 1.8 : isHovered ? 1.4 : 1.0;
              child.material.color.setHex(isSelected ? 0xffffff : config.hex);
            } else if (visualState === 'dimmed') {
              child.material.opacity = 0.15;
              child.material.emissiveIntensity = 0.05;
              child.material.color.setHex(config.hex);
            } else {
              child.material.opacity = 1.0;
              child.material.emissiveIntensity = 0.25;
              child.material.color.setHex(config.hex);
            }
          } else if (child.material instanceof THREE.MeshBasicMaterial) {
            child.material.transparent = true;
            if (visualState === 'highlight') {
              child.material.opacity = 1.0;
            } else if (visualState === 'dimmed') {
              child.material.opacity = 0.1;
            } else {
              child.material.opacity = 1.0;
            }
          }
        } else if (child instanceof THREE.LineSegments) {
          if (child.material instanceof THREE.LineBasicMaterial) {
            child.material.transparent = true;
            if (visualState === 'highlight') {
              child.material.opacity = 1.0;
              child.material.color.setHex(config.hex);
            } else if (visualState === 'dimmed') {
              child.material.opacity = 0.1;
            } else {
              child.material.opacity = 0.6;
              child.material.color.setHex(config.hex);
            }
          }
        }
      });
    });
  }, [selectedNodeId, hoveredNodeId, graphData, hoveredEdge, searchQuery, selectedCategory]);

  // 4. Force-directed physics layout and main animation loop
  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const controls = controlsRef.current;

      if (!scene || !camera || !renderer || !controls) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      // A. Physics Forces simulation
      if (enablePhysics && physicsNodesRef.current.size > 0) {
        const nodes = Array.from(physicsNodesRef.current.values()) as PhysicsNode[];

        // Parameters
        const kRepulsion = 12.0; // Pushes nodes apart
        const kAttraction = 0.08; // Springs connected nodes
        const naturalLength = 5.0; // Desired connection distance
        const gravityCenter = 0.02; // Attracts all to (0,0,0)
        const friction = 0.85; // Damps speeds

        // Initialize forces
        nodes.forEach((n) => {
          n.vx *= friction;
          n.vz *= friction;
        });

        // 1. Repulsive forces between ALL node pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const n1 = nodes[i];
            const n2 = nodes[j];

            const dx = n2.x - n1.x;
            const dz = n2.z - n1.z;
            const distSq = dx * dx + dz * dz + 0.1;
            const dist = Math.sqrt(distSq);

            if (dist < 15) {
              // Coulomb-like force
              const force = kRepulsion / distSq;
              const fx = (dx / dist) * force;
              const fz = (dz / dist) * force;

              // Do not apply force if user is dragging this node
              if (draggingNodeIdRef.current !== n1.id) {
                n1.vx -= fx;
                n1.vz -= fz;
              }
              if (draggingNodeIdRef.current !== n2.id) {
                n2.vx += fx;
                n2.vz += fz;
              }
            }
          }
        }

        // 2. Attractive spring forces along edges
        graphData.edges.forEach((edge) => {
          const sNode = physicsNodesRef.current.get(edge.source);
          const tNode = physicsNodesRef.current.get(edge.target);

          if (sNode && tNode) {
            const dx = tNode.x - sNode.x;
            const dz = tNode.z - sNode.z;
            const dist = Math.sqrt(dx * dx + dz * dz) + 0.01;

            const displacement = dist - naturalLength;
            const force = kAttraction * displacement;

            const fx = (dx / dist) * force;
            const fz = (dz / dist) * force;

            if (draggingNodeIdRef.current !== sNode.id) {
              sNode.vx += fx;
              sNode.vz += fz;
            }
            if (draggingNodeIdRef.current !== tNode.id) {
              tNode.vx -= fx;
              tNode.vz -= fz;
            }
          }
        });

        // 3. Center gravity force pulling to center
        nodes.forEach((n) => {
          if (draggingNodeIdRef.current !== n.id) {
            n.vx -= n.x * gravityCenter;
            n.vz -= n.z * gravityCenter;
          }
        });

        // 4. Apply forces to update positions
        nodes.forEach((n) => {
          if (draggingNodeIdRef.current !== n.id) {
            n.x += n.vx;
            n.z += n.vz;

            // Constrain nodes to grid size
            n.x = Math.max(-28, Math.min(28, n.x));
            n.z = Math.max(-28, Math.min(28, n.z));
          }
        });
      }

      // B. Sync physics positions to 3D representation & redraw lines
      physicsNodesRef.current.forEach((physNode) => {
        const meshGroup = nodeMeshesRef.current.get(physNode.id);
        if (meshGroup) {
          // Smoothly slide group position for bouncy organic movement
          meshGroup.position.x += (physNode.x - meshGroup.position.x) * 0.25;
          meshGroup.position.z += (physNode.z - meshGroup.position.z) * 0.25;

          // Tiny idle floating bounce for skyscrapers
          const time = Date.now() * 0.001;
          const bounceOffset = Math.sin(time + physNode.x * 0.2) * 0.05;
          const buildingMesh = meshGroup.children.find((c: any) => c.userData?.isBuilding);
          if (buildingMesh) {
            buildingMesh.position.y = physNode.height / 2 + bounceOffset;
          }
        }
      });

      // Update edges lines endpoints and colors
      if (edgeLinesRef.current && physicsNodesRef.current.size > 0) {
        const positionsArr: number[] = [];
        const colorArr: number[] = [];

        const hasFocus = !!selectedNodeId || !!hoveredNodeId || !!hoveredEdge || searchQuery.trim().length > 0 || selectedCategory !== 'All';

        graphData.edges.forEach((edge) => {
          const sNode = physicsNodesRef.current.get(edge.source);
          const tNode = physicsNodesRef.current.get(edge.target);

          if (sNode && tNode) {
            const sGroup = nodeMeshesRef.current.get(edge.source);
            const tGroup = nodeMeshesRef.current.get(edge.target);

            // Use mesh group real coordinates to keep line ends matching smooth transitions
            const sx = sGroup ? sGroup.position.x : sNode.x;
            const sz = sGroup ? sGroup.position.z : sNode.z;
            const tx = tGroup ? tGroup.position.x : tNode.x;
            const tz = tGroup ? tGroup.position.z : tNode.z;

            positionsArr.push(sx, 0.15, sz);
            positionsArr.push(tx, 0.15, tz);

            const sCol = new THREE.Color(TYPE_CONFIGS[sNode.node.type]?.color || '#ffffff');
            const tCol = new THREE.Color(TYPE_CONFIGS[tNode.node.type]?.color || '#ffffff');

            // Highlight check
            const isHovered = hoveredEdge === edge || 
              (hoveredEdge && hoveredEdge.source === edge.source && hoveredEdge.target === edge.target);
            const isConnectedToHovered = hoveredNodeId === edge.source || hoveredNodeId === edge.target;
            const isConnectedToSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;

            const sourceMatchesSearch = searchQuery.trim() === '' || 
              sNode.node.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
              sNode.node.id.toLowerCase().includes(searchQuery.toLowerCase());
            const targetMatchesSearch = searchQuery.trim() === '' || 
              tNode.node.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
              tNode.node.id.toLowerCase().includes(searchQuery.toLowerCase());
            
            const sourceMatchesCategory = selectedCategory === 'All' || sNode.node.type === selectedCategory;
            const targetMatchesCategory = selectedCategory === 'All' || tNode.node.type === selectedCategory;

            const isSourceMatched = sourceMatchesSearch && sourceMatchesCategory;
            const isTargetMatched = targetMatchesSearch && targetMatchesCategory;

            const matchesActiveFilters = hasFocus && (isSourceMatched || isTargetMatched);
            const isHighlighted = isHovered || isConnectedToHovered || isConnectedToSelected || matchesActiveFilters;

            let r1 = sCol.r;
            let g1 = sCol.g;
            let b1 = sCol.b;
            let r2 = tCol.r;
            let g2 = tCol.g;
            let b2 = tCol.b;

            if (!isHighlighted && hasFocus) {
              const dimFactor = 0.08;
              r1 *= dimFactor; g1 *= dimFactor; b1 *= dimFactor;
              r2 *= dimFactor; g2 *= dimFactor; b2 *= dimFactor;
            } else if (!hasFocus) {
              const normFactor = 0.7;
              r1 *= normFactor; g1 *= normFactor; b1 *= normFactor;
              r2 *= normFactor; g2 *= normFactor; b2 *= normFactor;
            }

            colorArr.push(r1, g1, b1);
            colorArr.push(r2, g2, b2);
          }
        });

        const posAttr = edgeLinesRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr && posAttr.count === positionsArr.length / 3) {
          posAttr.copyArray(positionsArr);
          posAttr.needsUpdate = true;
        } else {
          // Re-create buffer geometry if size changed
          edgeLinesRef.current.geometry.dispose();
          const newGeo = new THREE.BufferGeometry();
          newGeo.setAttribute('position', new THREE.Float32BufferAttribute(positionsArr, 3));
          newGeo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
          edgeLinesRef.current.geometry = newGeo;
          const colAttr = edgeLinesRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
          if (colAttr) colAttr.needsUpdate = true;
        }

        const colAttr = edgeLinesRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
        if (colAttr && colAttr.count === colorArr.length / 3) {
          colAttr.copyArray(colorArr);
          colAttr.needsUpdate = true;
        }
      }

      // C. Update controls and render WebGL
      controls.update();
      renderer.render(scene, camera);

      // D. Project 3D nodes to 2D screen coordinate labels
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;

        const nextLabels = graphData.nodes.map((node) => {
          const physNode = physicsNodesRef.current.get(node.id);
          const group = nodeMeshesRef.current.get(node.id);

          const tempV = new THREE.Vector3();
          if (group) {
            // Project slightly above building top
            const height = physNode ? physNode.height : 1.5;
            tempV.set(group.position.x, height + 0.5, group.position.z);
            tempV.project(camera);
          }

          return {
            id: node.id,
            label: node.label,
            type: node.type,
            x: (tempV.x * 0.5 + 0.5) * w,
            y: (tempV.y * -0.5 + 0.5) * h,
            height: physNode ? physNode.height : 1,
          };
        });

        setProjectedLabels(nextLabels);
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [graphData, enablePhysics, selectedNodeId, hoveredNodeId, hoveredEdge, searchQuery, selectedCategory]);

  // 5. Mouse Interaction, raycasting, clicking and dragging
  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    mouseRef.current.set(x, y);
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // If dragging a node, project mouse to ground plane to move node
    if (draggingNodeIdRef.current) {
      const intersection = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersection);

      const physNode = physicsNodesRef.current.get(draggingNodeIdRef.current);
      if (physNode) {
        physNode.x = Math.max(-28, Math.min(28, intersection.x));
        physNode.z = Math.max(-28, Math.min(28, intersection.z));

        // Instantly move the 3D group too
        const group = nodeMeshesRef.current.get(draggingNodeIdRef.current);
        if (group) {
          group.position.x = physNode.x;
          group.position.z = physNode.z;
        }
      }
      return;
    }

    // Otherwise, check for hover interactions
    const intersects = raycasterRef.current.intersectObjects(sceneRef.current.children, true);
    let foundNodeId: string | null = null;

    for (let i = 0; i < intersects.length; i++) {
      const obj = intersects[i].object;
      if (obj.userData?.nodeId) {
        foundNodeId = obj.userData.nodeId;
        break;
      }
    }

    if (foundNodeId !== hoveredNodeId) {
      onHoverNode(foundNodeId);
    }

    // If a node is hovered, reset edge hover and return
    if (foundNodeId) {
      if (hoveredEdge !== null) {
        setHoveredEdge(null);
      }
      return;
    }

    // Otherwise, check if mouse is close to a 2D projected edge line segment
    let foundEdge: Edge | null = null;
    if (graphData.edges.length > 0) {
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;

      const projectedCoords = new Map<string, { x: number; y: number }>();
      graphData.nodes.forEach((node) => {
        const group = nodeMeshesRef.current.get(node.id);
        const physNode = physicsNodesRef.current.get(node.id);
        if (group && physNode) {
          const tempV = new THREE.Vector3();
          tempV.set(group.position.x, physNode.height / 2, group.position.z);
          tempV.project(cameraRef.current!);
          projectedCoords.set(node.id, {
            x: (tempV.x * 0.5 + 0.5) * w,
            y: (tempV.y * -0.5 + 0.5) * h,
          });
        }
      });

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let minDistance = Infinity;
      const hoverThresholdPx = 14; // comfort zone

      graphData.edges.forEach((edge) => {
        const s = projectedCoords.get(edge.source);
        const t = projectedCoords.get(edge.target);
        if (s && t) {
          const dist = getDistanceToSegment(mouseX, mouseY, s.x, s.y, t.x, t.y);
          if (dist < minDistance && dist < hoverThresholdPx) {
            minDistance = dist;
            foundEdge = edge;
          }
        }
      });
    }

    if (foundEdge !== hoveredEdge) {
      setHoveredEdge(foundEdge);
    }
  };

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current || !controlsRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    mouseRef.current.set(x, y);
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const intersects = raycasterRef.current.intersectObjects(sceneRef.current.children, true);
    let clickedNodeId: string | null = null;

    for (let i = 0; i < intersects.length; i++) {
      const obj = intersects[i].object;
      if (obj.userData?.nodeId) {
        clickedNodeId = obj.userData.nodeId;
        break;
      }
    }

    if (clickedNodeId) {
      // Handle node select
      onSelectNode(clickedNodeId);

      // Setup node drag
      if (e.shiftKey || !isIsometric) {
        // Drag node if shift pressed or in perspective mode
        draggingNodeIdRef.current = clickedNodeId;
        controlsRef.current.enabled = false; // Disable orbit orbit while dragging node
      }
    } else {
      // Clear selection if clicked background
      onSelectNode(null);
    }
  };

  const handleMouseUp = () => {
    if (draggingNodeIdRef.current) {
      draggingNodeIdRef.current = null;
      if (controlsRef.current) {
        controlsRef.current.enabled = true; // Re-enable orbit controls
      }
    }
  };

  return (
    <div id="3d-canvas-wrapper" className="relative w-full h-full select-none overflow-hidden" ref={containerRef}>
      {/* Loading Overlay */}
      {!layout && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center font-mono text-xs text-zinc-500 gap-2 z-20">
          <div className="w-4 h-4 border-2 border-t-transparent border-zinc-500 rounded-full animate-spin" />
          <span>CALCULATING CITY TOPOLOGY...</span>
        </div>
      )}

      {/* Three.js Canvas */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Floating 2D overlay text labels projected on top of WebGL Nodes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {projectedLabels.map((lbl) => {
          // Hide labels if they fall outside the container bounds
          if (lbl.x < 0 || lbl.x > (containerRef.current?.clientWidth || 0) || lbl.y < 0 || lbl.y > (containerRef.current?.clientHeight || 0)) {
            return null;
          }

          const isSelected = selectedNodeId === lbl.id;
          const isHovered = hoveredNodeId === lbl.id;

          const matchesSearch = searchQuery.trim() === '' || 
            lbl.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
            lbl.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lbl.type.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesCategory = selectedCategory === 'All' || lbl.type === selectedCategory;
          const isFilterMatched = matchesSearch && matchesCategory;

          const isConnectedToHovered = hoveredNodeId ? graphData.edges.some(
            e => (e.source === hoveredNodeId && e.target === lbl.id) || (e.target === hoveredNodeId && e.source === lbl.id)
          ) : false;

          const isConnectedToSelected = selectedNodeId ? graphData.edges.some(
            e => (e.source === selectedNodeId && e.target === lbl.id) || (e.target === selectedNodeId && e.source === lbl.id)
          ) : false;

          const isConnectedToHoveredEdge = hoveredEdge ? (
            hoveredEdge.source === lbl.id || hoveredEdge.target === lbl.id
          ) : false;

          const hasFocus = !!selectedNodeId || !!hoveredNodeId || !!hoveredEdge || searchQuery.trim().length > 0 || selectedCategory !== 'All';

          let labelState: 'highlight' | 'normal' | 'dimmed' = 'normal';
          if (isSelected || isHovered) {
            labelState = 'highlight';
          } else if (isConnectedToHovered || isConnectedToSelected || isConnectedToHoveredEdge) {
            labelState = 'highlight';
          } else if (hasFocus && isFilterMatched) {
            labelState = 'highlight';
          } else if (hasFocus) {
            labelState = 'dimmed';
          }

          const config = TYPE_CONFIGS[lbl.type] || { color: '#ffffff' };

          return (
            <div
              key={lbl.id}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center transition-all duration-75 pointer-events-auto"
              style={{
                left: `${lbl.x}px`,
                top: `${lbl.y}px`,
                zIndex: isSelected ? 30 : isHovered || labelState === 'highlight' ? 20 : 10,
              }}
            >
              {/* Dynamic tag container */}
              <button
                onClick={() => onSelectNode(lbl.id)}
                onMouseEnter={() => onHoverNode(lbl.id)}
                onMouseLeave={() => onHoverNode(null)}
                className={`px-2 py-0.5 rounded border text-[10px] font-mono font-medium shadow-md backdrop-blur-md flex items-center gap-1 transition-all ${
                  isSelected
                    ? 'bg-black text-white scale-110 border-white shadow-lg shadow-white/5 font-bold'
                    : isHovered || labelState === 'highlight'
                    ? 'bg-black text-white scale-105 border-zinc-500 font-semibold'
                    : labelState === 'dimmed'
                    ? 'bg-black/30 text-zinc-650 border-zinc-900 opacity-20 scale-95 pointer-events-none'
                    : 'bg-black text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-500'
                }`}
              >
                {lbl.label}
              </button>

              {/* Little anchor line triangle */}
              <div
                className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent mt-[-1px] transition-all"
                style={{
                  borderTopColor: isSelected ? '#ffffff' : isHovered || labelState === 'highlight' ? '#71717a' : labelState === 'dimmed' ? 'transparent' : '#27272a',
                  opacity: labelState === 'dimmed' ? 0.1 : 1.0,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Floating Holographic Relation Tooltip */}
      {hoveredEdge && (
        (() => {
          const sGroup = nodeMeshesRef.current.get(hoveredEdge.source);
          const tGroup = nodeMeshesRef.current.get(hoveredEdge.target);
          const sPhys = physicsNodesRef.current.get(hoveredEdge.source);
          const tPhys = physicsNodesRef.current.get(hoveredEdge.target);

          if (sGroup && tGroup && sPhys && tPhys && containerRef.current && cameraRef.current) {
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;

            const vS = new THREE.Vector3(sGroup.position.x, sPhys.height / 2, sGroup.position.z);
            const vT = new THREE.Vector3(tGroup.position.x, tPhys.height / 2, tGroup.position.z);

            // Midpoint
            const midV = new THREE.Vector3().addVectors(vS, vT).multiplyScalar(0.5);
            midV.project(cameraRef.current);

            const x = (midV.x * 0.5 + 0.5) * w;
            const y = (midV.y * -0.5 + 0.5) * h;

            // Don't show if offscreen
            if (x >= 0 && x <= w && y >= 0 && y <= h) {
              return (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none flex flex-col items-center animate-fade-in"
                  style={{ left: `${x}px`, top: `${y}px` }}
                >
                  <div className="px-2.5 py-1 rounded bg-black/95 border border-zinc-300 text-[10px] font-mono font-bold tracking-wider text-white shadow-2xl flex items-center gap-1.5 backdrop-blur-md">
                    <span className="text-[8px] text-zinc-500 font-normal uppercase">RELATION:</span>
                    <span className="text-zinc-200">{hoveredEdge.relation}</span>
                  </div>
                </div>
              );
            }
          }
          return null;
        })()
      )}

      {/* Floating Dashboard Overlays */}
      <div className="absolute top-4 left-4 right-4 flex flex-col md:flex-row md:items-center justify-between gap-3 z-20 pointer-events-none">
        {/* Left Side: System Controls & Search */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Camera Toggle */}
          <button
            onClick={() => setIsIsometric((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono font-medium transition-all shadow-sm cursor-pointer ${
              isIsometric
                ? 'bg-white text-black border-white font-bold'
                : 'bg-black text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
            }`}
            title={isIsometric ? 'Lock SimCity-style orthographic projection' : 'Unlock perspective camera rotation'}
          >
            {isIsometric ? 'CAM: ISOMETRIC' : 'CAM: PERSPECTIVE'}
          </button>

          {/* Physics Force Toggle */}
          <button
            onClick={() => setEnablePhysics((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono font-medium transition-all shadow-sm cursor-pointer ${
              enablePhysics
                ? 'bg-white text-black border-white font-bold'
                : 'bg-black text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
            }`}
            title="Toggle spring force alignment simulation"
          >
            {enablePhysics ? 'PHYSICS: ACTIVE' : 'PHYSICS: PAUSED'}
          </button>

          {/* D3 Auto-Layout Trigger */}
          <button
            onClick={() => {
              const positions = runD3Simulation(graphData.nodes, graphData.edges);
              setD3Positions(positions);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-mono font-medium transition-all shadow-sm cursor-pointer bg-black text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
            title="Run D3 force-directed simulation to align skyscrapers to city block lots"
          >
            GRID: ALIGN (D3)
          </button>

          {/* Search Bar */}
          <div className="relative flex items-center bg-black/95 border border-zinc-800 rounded px-2.5 py-1.5 shadow-md">
            <span className="text-zinc-500 font-mono text-[9px] mr-1.5 uppercase select-none font-bold">SEARCH:</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Label, type, id..."
              className="bg-transparent text-white font-mono text-[10px] placeholder-zinc-650 focus:outline-none w-28 focus:w-40 transition-all border-0 p-0"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-zinc-500 hover:text-white font-mono text-[10px] ml-1.5 px-0.5 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Category Filters */}
        <div className="flex flex-wrap items-center gap-1 bg-black/95 border border-zinc-800 rounded p-1 shadow-md pointer-events-auto">
          <span className="text-zinc-500 font-mono text-[9px] px-1.5 uppercase select-none font-bold">HIGHLIGHT:</span>
          {CATEGORIES.map((cat) => {
            const isSel = selectedCategory === cat;
            const config = cat === 'All' ? { color: '#ffffff', hex: 0xffffff } : TYPE_CONFIGS[cat];
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-1 rounded text-[9px] font-mono font-bold uppercase transition-all cursor-pointer ${
                  isSel
                    ? 'bg-zinc-100 text-black font-bold'
                    : 'bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
                style={isSel && cat !== 'All' ? { backgroundColor: config.color, color: '#000000' } : {}}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid scale indicator */}
      <div className="absolute bottom-4 right-4 pointer-events-none text-[9px] font-mono text-zinc-500 bg-black px-2 py-1 rounded border border-zinc-800 flex flex-col items-end gap-1">
        <span>GRID RANGE: 80x80 units</span>
        <span>DRAG: SHIFT + DRAG MOUSE</span>
        <span>ROTATION: ORBIT CONTROL LOCK</span>
      </div>
    </div>
  );
}
