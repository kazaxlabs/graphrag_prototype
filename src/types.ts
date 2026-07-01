/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NodeType = 'Person' | 'Organization' | 'Infrastructure' | 'Event' | 'Concept';

export interface Node {
  id: string;
  type: NodeType;
  label: string;
  metadata: Record<string, string>;
  history: string[];
}

export interface Edge {
  source: string;
  target: string;
  relation: string;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}
