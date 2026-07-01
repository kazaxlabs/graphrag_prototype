/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GraphData } from './types';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  unstructuredText: string;
  graphData: GraphData;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'alice_security',
    name: 'Security Incident (Alice & Server X)',
    description: 'The standard incident tracking the developer, team, and vulnerable server.',
    unstructuredText: 'Alice works as a Senior Developer for the Security Team. She joined the company in 2021 and was promoted in 2023. Yesterday, she flagged Server X as vulnerable. Server X was previously patched in 2022.',
    graphData: {
      nodes: [
        {
          id: 'alice',
          type: 'Person',
          label: 'Alice',
          metadata: {
            role: 'Senior Developer'
          },
          history: [
            'Joined the company in 2021',
            'Promoted in 2023'
          ]
        },
        {
          id: 'security_team',
          type: 'Organization',
          label: 'Security Team',
          metadata: {},
          history: []
        },
        {
          id: 'server_x',
          type: 'Infrastructure',
          label: 'Server X',
          metadata: {
            status: 'vulnerable'
          },
          history: [
            'Previously patched in 2022'
          ]
        }
      ],
      edges: [
        {
          source: 'alice',
          target: 'security_team',
          relation: 'WORKS_FOR'
        },
        {
          source: 'alice',
          target: 'server_x',
          relation: 'FLAGGED_AS_VULNERABLE'
        }
      ]
    }
  },
  {
    id: 'fintech_cloud',
    name: 'Fintech Microservice Outage',
    description: 'A multi-tier cloud infrastructure, payment services, databases, and a recent incident event.',
    unstructuredText: 'The Payment Service, which runs on the Kubernetes Cluster, experienced a high latency alert today at 04:00 UTC. The database administrator, Bob (part of the DevOps Team), discovered that the database PostgreSQL Primary was locked up due to an index corruption event. PostgreSQL Primary is managed by the DevOps Team. Bob solved the lockup by rebuilding the index on PostgreSQL Primary and restarted the Payment Service at 05:15 UTC. The Payment Service handles payment transactions for the organization Global Bank.',
    graphData: {
      nodes: [
        {
          id: 'payment_service',
          type: 'Infrastructure',
          label: 'Payment Service',
          metadata: {
            language: 'Go',
            status: 'Restored'
          },
          history: [
            'Experienced a high latency alert today at 04:00 UTC',
            'Restarted at 05:15 UTC after rebuilding indices'
          ]
        },
        {
          id: 'k8s_cluster',
          type: 'Infrastructure',
          label: 'Kubernetes Cluster',
          metadata: {
            environment: 'Production',
            provider: 'GCP'
          },
          history: []
        },
        {
          id: 'bob',
          type: 'Person',
          label: 'Bob',
          metadata: {
            role: 'Database Administrator'
          },
          history: [
            'Discovered database PostgreSQL Primary was locked up due to index corruption',
            'Rebuilt PostgreSQL index to solve lockup'
          ]
        },
        {
          id: 'devops_team',
          type: 'Organization',
          label: 'DevOps Team',
          metadata: {
            shift: '24/7 Follow-the-Sun'
          },
          history: []
        },
        {
          id: 'postgres_primary',
          type: 'Infrastructure',
          label: 'PostgreSQL Primary',
          metadata: {
            version: '15.4',
            engine: 'Cloud SQL'
          },
          history: [
            'Locked up due to an index corruption event today',
            'Index rebuilt by Bob at 05:15 UTC'
          ]
        },
        {
          id: 'global_bank',
          type: 'Organization',
          label: 'Global Bank',
          metadata: {
            industry: 'Finance'
          },
          history: []
        },
        {
          id: 'latency_incident',
          type: 'Event',
          label: 'Latency Incident',
          metadata: {
            severity: 'High',
            duration: '75 minutes'
          },
          history: [
            'Began at 04:00 UTC with customer-facing degradation',
            'Resolved at 05:15 UTC with service verification'
          ]
        }
      ],
      edges: [
        {
          source: 'payment_service',
          target: 'k8s_cluster',
          relation: 'RUNS_ON'
        },
        {
          source: 'bob',
          target: 'devops_team',
          relation: 'MEMBER_OF'
        },
        {
          source: 'postgres_primary',
          target: 'devops_team',
          relation: 'MANAGED_BY'
        },
        {
          source: 'payment_service',
          target: 'postgres_primary',
          relation: 'DEPENDS_ON'
        },
        {
          source: 'payment_service',
          target: 'latency_incident',
          relation: 'AFFECTED_BY'
        },
        {
          source: 'bob',
          target: 'latency_incident',
          relation: 'INVESTIGATED'
        },
        {
          source: 'payment_service',
          target: 'global_bank',
          relation: 'SERVES'
        }
      ]
    }
  },
  {
    id: 'fantasy_alliance',
    name: 'Kingdoms of Eldoria',
    description: 'An illustrative lore graph showing medieval houses, kingdoms, battles, and legendary treaties.',
    unstructuredText: 'The Kingdom of Eldoria signed the Golden Pact in 1240 AP with House Valerius to establish a lasting trade alliance. King Arthur, who leads House Valerius, hosted the signing ceremony at the Obsidian Citadel. However, the alliance was tested in 1245 AP during the Siege of Ironforge, when the Shadow Syndicate raided the trade caravans. Arthur sent his chief knight, Sir Galahad, to defend Ironforge, resulting in a decisive victory that cemented the strength of Eldoria.',
    graphData: {
      nodes: [
        {
          id: 'eldoria',
          type: 'Organization',
          label: 'Kingdom of Eldoria',
          metadata: {
            regime: 'Monarchy',
            capital: 'Silvergard'
          },
          history: [
            'Signed the Golden Pact in 1240 AP with House Valerius',
            'Tested during the Siege of Ironforge in 1245 AP'
          ]
        },
        {
          id: 'golden_pact',
          type: 'Concept',
          label: 'Golden Pact',
          metadata: {
            type: 'Trade & Military Alliance',
            signed_year: '1240 AP'
          },
          history: [
            'Established lasting trade alliance',
            'Signed at the Obsidian Citadel'
          ]
        },
        {
          id: 'house_valerius',
          type: 'Organization',
          label: 'House Valerius',
          metadata: {
            emblem: 'Golden Eagle',
            influence: 'Military'
          },
          history: []
        },
        {
          id: 'king_arthur',
          type: 'Person',
          label: 'King Arthur',
          metadata: {
            title: 'King of Valerius'
          },
          history: [
            'Hosted the signing of the Golden Pact at the Obsidian Citadel',
            'Sent Sir Galahad to defend Ironforge in 1245 AP'
          ]
        },
        {
          id: 'obsidian_citadel',
          type: 'Infrastructure',
          label: 'Obsidian Citadel',
          metadata: {
            location: 'Volcanic Ridge',
            status: 'Fortified'
          },
          history: [
            'Hosted the signing ceremony of the Golden Pact in 1240 AP'
          ]
        },
        {
          id: 'siege_of_ironforge',
          type: 'Event',
          label: 'Siege of Ironforge',
          metadata: {
            year: '1245 AP',
            outcome: 'Eldorian Coalition Victory'
          },
          history: [
            'Sparked by raids from the Shadow Syndicate on trade caravans',
            'Resolved with Sir Galahad defending the fortress successfully'
          ]
        },
        {
          id: 'shadow_syndicate',
          type: 'Organization',
          label: 'Shadow Syndicate',
          metadata: {
            type: 'Mercenary Outlaw Ring'
          },
          history: [
            'Raided Eldorian trade caravans in 1245 AP',
            'Defeated at Ironforge by Sir Galahad'
          ]
        },
        {
          id: 'sir_galahad',
          type: 'Person',
          label: 'Sir Galahad',
          metadata: {
            rank: 'Chief Knight'
          },
          history: [
            'Sent by King Arthur in 1245 AP to defend Ironforge',
            'Won a decisive victory against the Shadow Syndicate'
          ]
        }
      ],
      edges: [
        {
          source: 'eldoria',
          target: 'golden_pact',
          relation: 'BOUND_BY'
        },
        {
          source: 'house_valerius',
          target: 'golden_pact',
          relation: 'BOUND_BY'
        },
        {
          source: 'king_arthur',
          target: 'house_valerius',
          relation: 'LEADS'
        },
        {
          source: 'king_arthur',
          target: 'obsidian_citadel',
          relation: 'RULES_FROM'
        },
        {
          source: 'eldoria',
          target: 'siege_of_ironforge',
          relation: 'DEFENDED_IN'
        },
        {
          source: 'shadow_syndicate',
          target: 'siege_of_ironforge',
          relation: 'ATTACKED_IN'
        },
        {
          source: 'sir_galahad',
          target: 'king_arthur',
          relation: 'OATH_TO'
        },
        {
          source: 'sir_galahad',
          target: 'siege_of_ironforge',
          relation: 'HERO_OF'
        }
      ]
    }
  }
];
