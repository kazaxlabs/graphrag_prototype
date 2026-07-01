/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

// Lazy-initialization of Gemini AI client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY environment variable is not defined. Please add it in the Secrets panel in AI Studio.'
      );
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON requests
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Text-to-Graph extraction endpoint using Gemini
  app.post('/api/extract', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || text.trim() === '') {
        res.status(400).json({ error: 'Text content is required for extraction.' });
        return;
      }

      // Check key and lazy-initialize
      const ai = getGeminiClient();

      // System instruction directing Gemini to act as the strict extraction engine
      const systemInstruction = `You are the central data extraction engine for a 3D Graph visualization platform. Your sole purpose is to convert unstructured text into a strict, predefined JSON graph structure.

Extract entities (Nodes) and the relationships between them (Edges).

RULES:
1. Output ONLY valid JSON according to the schema.
2. Ensure every 'source' and 'target' in the edges array perfectly matches a node 'id' in the nodes array.
3. Node IDs must be lowercase with underscores (e.g., "alice_smith"). Clean the text to form logical IDs.
4. If a piece of data represents a past state, historical event, or metadata, place it in the node's "history" array. This array builds the "stacked cards" under the main entity.
5. Choose from these exact ONTOLOGY CATEGORIES for the node's "type" field:
   - Person
   - Organization
   - Infrastructure
   - Event
   - Concept
6. Extract as much metadata (key-value strings) and history events as possible from the text to make the 3D representation rich. Ensure metadata keys are clean, and values are strings.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Extract nodes and edges from this unstructured text:\n\n"${text}"`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nodes: {
                type: Type.ARRAY,
                description: 'The list of extracted entities (nodes) in the graph.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                      description: 'Unique string ID, lowercase with underscores, e.g. alice_smith, server_x, house_valerius',
                    },
                    type: {
                      type: Type.STRING,
                      description: 'MUST be exactly one of: Person, Organization, Infrastructure, Event, Concept',
                    },
                    label: {
                      type: Type.STRING,
                      description: 'Human readable display name, e.g. Alice, Server X, House Valerius',
                    },
                    metadata: {
                      type: Type.OBJECT,
                      description: 'Key-value mapping of details (e.g., status, role, language, capital). Use strings only.',
                    },
                    history: {
                      type: Type.ARRAY,
                      description: 'Chronological events, past states, secondary details, or historical actions associated with the node.',
                      items: {
                        type: Type.STRING,
                      },
                    },
                  },
                  required: ['id', 'type', 'label'],
                },
              },
              edges: {
                type: Type.ARRAY,
                description: 'The list of relationships (edges) linking the nodes.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: {
                      type: Type.STRING,
                      description: 'Node ID of the source. Must exist in the nodes array.',
                    },
                    target: {
                      type: Type.STRING,
                      description: 'Node ID of the target. Must exist in the nodes array.',
                    },
                    relation: {
                      type: Type.STRING,
                      description: 'Description of the link, in uppercase with underscores, e.g. WORKS_FOR, DEPLOYED_ON, FLAGGED_AS_VULNERABLE, MEMBER_OF',
                    },
                  },
                  required: ['source', 'target', 'relation'],
                },
              },
            },
            required: ['nodes', 'edges'],
          },
        },
      });

      const extractedText = response.text;
      if (!extractedText) {
        throw new Error('No content returned from the model.');
      }

      // Parse the JSON to verify format
      const graphData = JSON.parse(extractedText);
      res.json(graphData);
    } catch (error: any) {
      console.error('Extraction failed:', error);
      res.status(500).json({
        error: error.message || 'Failed to extract structured data from the text.',
        isApiKeyMissing: !process.env.GEMINI_API_KEY,
      });
    }
  });

  // Set up Vite or static serving based on environment
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
