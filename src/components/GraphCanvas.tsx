/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, MouseEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GraphData, Node, NodeType } from '../types';

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

  // 1. Initialize Scene, Camera, Lights and Renderer
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Create Scene with space background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);
    scene.fog = new THREE.FogExp2(0x050508, 0.015);
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
      const d = 12;
      camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 1000);
      camera.position.set(15, 15, 15);
    } else {
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(15, 18, 20);
    }
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.minDistance = 3;
    controls.maxDistance = 50;
    controlsRef.current = controls;

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambientLight);

    // Dynamic blue atmospheric point lights
    const blueLight = new THREE.PointLight(0x3b82f6, 1.5, 30);
    blueLight.position.set(-15, 5, -15);
    scene.add(blueLight);

    const tealLight = new THREE.PointLight(0x0d9488, 1.2, 30);
    tealLight.position.set(15, 5, 15);
    scene.add(tealLight);

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
    const grid = new THREE.GridHelper(80, 80, 0x1e293b, 0x0f172a);
    grid.position.y = -0.01;
    scene.add(grid);
    groundGridRef.current = grid;

    // Ground reflector slab
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x020205,
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
        const d = 12;
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

  // 2. Sync graphData to physics nodes and generate 3D meshes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clean old meshes
    nodeMeshesRef.current.forEach((mesh) => scene.remove(mesh));
    nodeMeshesRef.current.clear();

    if (edgeLinesRef.current) {
      scene.remove(edgeLinesRef.current);
      edgeLinesRef.current = null;
    }

    const nextPhysicsNodes = new Map<string, PhysicsNode>();

    // Determine physics nodes positions, maintaining positions if they already exist
    graphData.nodes.forEach((node, i) => {
      const existing = physicsNodesRef.current.get(node.id);

      // Node skyscraper height based on data complexity
      const historyCount = node.history ? node.history.length : 0;
      const metadataCount = node.metadata ? Object.keys(node.metadata).length : 0;
      const height = 0.8 + historyCount * 0.4 + metadataCount * 0.2;

      if (existing) {
        nextPhysicsNodes.set(node.id, {
          ...existing,
          node,
          height,
        });
      } else {
        // Distribute newly added nodes on a circle
        const angle = (i / Math.max(graphData.nodes.length, 1)) * Math.PI * 2;
        const radius = 6 + Math.random() * 2;
        nextPhysicsNodes.set(node.id, {
          id: node.id,
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
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
          color: 0x0f172a,
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

    graphData.edges.forEach((edge) => {
      const sourceNode = physicsNodesRef.current.get(edge.source);
      const targetNode = physicsNodesRef.current.get(edge.target);

      if (sourceNode && targetNode) {
        // Connect bases of buildings (slightly raised to look floating)
        const sourceColor = TYPE_CONFIGS[sourceNode.node.type]?.color || '#ffffff';
        const targetColor = TYPE_CONFIGS[targetNode.node.type]?.color || '#ffffff';

        const sCol = new THREE.Color(sourceColor);
        const tCol = new THREE.Color(targetColor);

        // Add start and end points
        edgePositions.push(sourceNode.x, 0.15, sourceNode.z);
        edgePositions.push(targetNode.x, 0.15, targetNode.z);

        edgeColors.push(sCol.r, sCol.g, sCol.b);
        edgeColors.push(tCol.r, tCol.g, tCol.b);
      }
    });

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    edgeGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));

    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2,
      transparent: true,
      opacity: 0.65,
    });

    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(edgeLines);
    edgeLinesRef.current = edgeLines;
  }, [graphData, selectedNodeId, hoveredNodeId]);

  // 3. Update building glowing intensity on hover/selection
  useEffect(() => {
    graphData.nodes.forEach((node) => {
      const group = nodeMeshesRef.current.get(node.id);
      if (group) {
        const building = group.children.find((c: any) => c.userData?.isBuilding) as THREE.Mesh;
        if (building && building.material instanceof THREE.MeshStandardMaterial) {
          const config = TYPE_CONFIGS[node.type];
          if (config) {
            let intensity = 0.25;
            if (selectedNodeId === node.id) {
              intensity = 1.8;
              building.material.color.setHex(0xffffff); // Glow hyper-white-tint
            } else if (hoveredNodeId === node.id) {
              intensity = 1.1;
              building.material.color.setHex(config.hex);
            } else {
              building.material.color.setHex(config.hex);
            }
            building.material.emissiveIntensity = intensity;
          }
        }
      }
    });
  }, [selectedNodeId, hoveredNodeId, graphData]);

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

      // Update edges lines endpoints
      if (edgeLinesRef.current && physicsNodesRef.current.size > 0) {
        const positionsArr: number[] = [];
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

          // Retain colors
          const colorArr: number[] = [];
          graphData.edges.forEach((edge) => {
            const sNode = physicsNodesRef.current.get(edge.source);
            const tNode = physicsNodesRef.current.get(edge.target);
            if (sNode && tNode) {
              const sCol = new THREE.Color(TYPE_CONFIGS[sNode.node.type]?.color || '#ffffff');
              const tCol = new THREE.Color(TYPE_CONFIGS[tNode.node.type]?.color || '#ffffff');
              colorArr.push(sCol.r, sCol.g, sCol.b);
              colorArr.push(tCol.r, tCol.g, tCol.b);
            }
          });
          newGeo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
          edgeLinesRef.current.geometry = newGeo;
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
  }, [graphData, enablePhysics, selectedNodeId]);

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
          const config = TYPE_CONFIGS[lbl.type] || { color: '#ffffff' };

          return (
            <div
              key={lbl.id}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center transition-all duration-75 pointer-events-auto"
              style={{
                left: `${lbl.x}px`,
                top: `${lbl.y}px`,
                zIndex: isSelected ? 30 : isHovered ? 20 : 10,
              }}
            >
              {/* Dynamic tag container */}
              <button
                onClick={() => onSelectNode(lbl.id)}
                onMouseEnter={() => onHoverNode(lbl.id)}
                onMouseLeave={() => onHoverNode(null)}
                className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-medium shadow-lg backdrop-blur-md flex items-center gap-1 transition-all ${
                  isSelected
                    ? 'bg-slate-900/90 text-white scale-110 shadow-indigo-500/30'
                    : isHovered
                    ? 'bg-slate-950/80 text-white scale-105'
                    : 'bg-slate-950/60 text-slate-300'
                }`}
                style={{
                  borderColor: isSelected || isHovered ? config.color : 'rgba(30,41,59,0.5)',
                  boxShadow: isSelected ? `0 4px 12px ${config.color}40` : '',
                }}
              >
                {/* Visual indicator color sphere */}
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                  style={{ backgroundColor: config.color }}
                />
                {lbl.label}
              </button>

              {/* Little anchor line triangle */}
              <div
                className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent mt-[-1px]"
                style={{
                  borderTopColor: isSelected || isHovered ? config.color : 'rgba(30,41,59,0.5)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Futuristic Floating Dashboard Overlays */}
      <div className="absolute top-4 left-4 flex gap-2 z-20 pointer-events-auto">
        {/* Camera Toggle */}
        <button
          onClick={() => setIsIsometric((p) => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all shadow-md backdrop-blur-md ${
            isIsometric
              ? 'bg-indigo-950/40 text-indigo-200 border-indigo-500/50 hover:bg-indigo-900/50'
              : 'bg-slate-900/50 text-slate-300 border-slate-700/60 hover:bg-slate-800/60'
          }`}
          title={isIsometric ? 'Lock SimCity-style orthographic projection' : 'Unlock perspective camera rotation'}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isIsometric ? '#6366f1' : '#94a3b8' }} />
          {isIsometric ? 'CAM: ISOMETRIC' : 'CAM: PERSPECTIVE'}
        </button>

        {/* Physics Force Toggle */}
        <button
          onClick={() => setEnablePhysics((p) => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all shadow-md backdrop-blur-md ${
            enablePhysics
              ? 'bg-emerald-950/40 text-emerald-200 border-emerald-500/50 hover:bg-emerald-900/50'
              : 'bg-slate-900/50 text-slate-300 border-slate-700/60 hover:bg-slate-800/60'
          }`}
          title="Toggle spring force alignment simulation"
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: enablePhysics ? '#10b981' : '#94a3b8' }} />
          {enablePhysics ? 'PHYSICS: ACTIVE' : 'PHYSICS: PAUSED'}
        </button>
      </div>

      {/* Cyberpunk grid scale indicator */}
      <div className="absolute bottom-4 right-4 pointer-events-none text-[9px] font-mono text-slate-500/80 bg-slate-950/40 px-2 py-1 rounded border border-slate-900/40 backdrop-blur-sm flex flex-col items-end gap-1">
        <span>GRID RANGE: 80x80 units</span>
        <span>DRAG: SHIFT + DRAG MOUSE</span>
        <span>ROTATION: ORBIT CONTROL LOCK</span>
      </div>
    </div>
  );
}
