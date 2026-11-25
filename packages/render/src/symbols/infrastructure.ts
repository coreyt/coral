/**
 * Cloud Infrastructure Symbols (Edition 0.2.14 — AWS, Azure, GCP, Kubernetes & cloud-neutral).
 * Layer 1 built-in Apache-2.0 geometric glyphs; Layer 2 official vendor SVGs travel as @symbol.
 */
import type { SymbolDefinition, SymbolLibrary, SymbolPort } from '../types.js';

const io: SymbolPort[] = [
  { id: 'in', anchor: 'WEST', direction: 'in' },
  { id: 'out', anchor: 'EAST', direction: 'out' },
];
const net: SymbolPort[] = [
  { id: 'in', anchor: 'WEST', direction: 'in' },
  { id: 'out', anchor: 'EAST', direction: 'out' },
  { id: 'data', anchor: 'SOUTH', direction: 'out' },
];
const store: SymbolPort[] = [{ id: 'access', anchor: 'WEST', direction: 'inout' }];

const mk = (
  id: string, name: string, shape: string, tags: string[],
  ports: SymbolPort[] = io, extra: Partial<SymbolDefinition> = {},
): SymbolDefinition => ({
  id, name, shape, tags, ports,
  defaults: { fill: '#f8fafc', stroke: '#334155', strokeWidth: 1.75, ...extra.defaults },
  ...(extra.isContainer ? { isContainer: true } : {}),
  ...(extra.variants ? { variants: extra.variants } : {}),
  addedInEdition: '0.2.14',
});

export const infrastructureSymbols: SymbolLibrary = {
  id: 'infrastructure',
  name: 'Cloud Infrastructure Symbols',
  version: '1.0.0',
  description: 'Cloud-neutral infrastructure symbols for AWS, Azure, GCP, and Kubernetes topologies',
  symbols: [
    mk('infra-users', 'Users', 'actor', ['users', 'client', 'internet'],
      [{ id: 'out', anchor: 'EAST', direction: 'out' }]),
    mk('infra-cdn', 'CDN', 'cloud', ['cdn', 'edge', 'cloudfront', 'network'], io),
    mk('infra-dns', 'DNS', 'cloud', ['dns', 'route53', 'network'], io),
    mk('infra-waf', 'WAF / Firewall', 'shield', ['waf', 'firewall', 'security'], io),
    mk('infra-gateway', 'Gateway', 'hexagon', ['gateway', 'api-gateway', 'ingress', 'network'], net),
    mk('infra-load-balancer', 'Load Balancer', 'hexagon', ['load-balancer', 'alb', 'nlb', 'network'], net),
    mk('infra-compute', 'Compute / VM', 'chip', ['compute', 'vm', 'ec2', 'gce', 'server'], net),
    mk('infra-container', 'Container', 'cube', ['container', 'ecs', 'fargate', 'cloud-run', 'aci'], net),
    mk('infra-kubernetes', 'Kubernetes', 'hexagon', ['kubernetes', 'k8s', 'eks', 'aks', 'gke'], net),
    mk('infra-function', 'Serverless Function', 'hexagon', ['function', 'lambda', 'serverless'], net),
    mk('infra-database', 'Database', 'cylinder', ['database', 'rds', 'aurora', 'sql', 'nosql', 'data'], store),
    mk('infra-cache', 'Cache', 'cylinder', ['cache', 'redis', 'memcached', 'elasticache', 'data'], store),
    mk('infra-storage', 'Storage', 'cylinder', ['storage', 's3', 'blob', 'gcs', 'bucket', 'ebs'], store),
    mk('infra-queue', 'Queue / Event Bus', 'parallelogram', ['queue', 'sqs', 'pubsub', 'event-bus', 'kafka'], io),
    mk('infra-iam', 'IAM / Secrets', 'shield', ['iam', 'secrets', 'kms', 'identity', 'security'], store),
    mk('infra-monitoring', 'Monitoring', 'dashboard', ['monitoring', 'observability', 'metrics', 'logs'], store),
    mk('infra-ml', 'AI / ML Service', 'brain', ['ml', 'ai', 'sagemaker', 'vertex', 'foundry'], net),
    mk('infra-note', 'Note', 'note', ['note', 'annotation', 'callout'], store),
    mk('infra-boundary', 'Cloud Boundary', 'rectangle',
      ['boundary', 'cloud', 'account', 'region', 'az', 'vpc', 'vnet', 'subnet', 'cluster', 'group'],
      [], {
        isContainer: true,
        defaults: { fill: 'none', stroke: '#64748b', strokeWidth: 1.5, strokeDasharray: '6 4', cornerRadius: 8 },
        variants: {
          public: { name: 'Public Subnet', defaults: { strokeDasharray: '6 3' } },
          private: { name: 'Private Subnet', defaults: { strokeDasharray: '3 3' } },
          vpc: { name: 'VPC / VNet', defaults: { strokeDasharray: '8 4' } },
          region: { name: 'Region / AZ', defaults: { strokeDasharray: '10 4' } },
          cluster: { name: 'Cluster', defaults: { strokeDasharray: '5 3' } },
        },
      }),
  ],
};
