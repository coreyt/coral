import type { LayoutDirection } from '../../src/layout/types.js';
import type { RenderStyle028 } from '../../src/visualStyle028.js';

export interface LayoutCorpusCase0211 {
  readonly id: string;
  readonly title: string;
  readonly notation:
    | 'flowchart'
    | 'architecture'
    | 'data-engineering'
    | 'aiml'
    | 'bpmn'
    | 'code'
    | 'block'
    | 'sketch'
    | 'uml-class';
  readonly scale: 'small' | 'medium' | 'large' | 'stress';
  readonly direction: LayoutDirection;
  readonly style: RenderStyle028;
  readonly stressors: readonly string[];
  readonly source: string;
}

/**
 * Coral 0.2.11 Slice 20: Canonical 40-diagram stratified layout & flow
 * verification corpus spanning all 9 active visual spatial notations, 4 scale
 * bands (5–26 nodes), flat and grouped/nested topologies, fan-in/fan-out up to
 * degree 6, cycles/back-edges, skip-layer long edges, and long captions.
 */
export const LAYOUT_CORPUS_0211: readonly LayoutCorpusCase0211[] = [
  // =========================================================================
  // FLOWCHART (7)
  // =========================================================================
  {
    id: 'c01-fc-linear-small-right',
    title: 'Small Linear Checkout Flow (5 nodes, RIGHT)',
    notation: 'flowchart',
    scale: 'small',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['straight-spine', 'decision-branch'],
    source: `@diagram flowchart
start terminal as "Cart ready"
addr io as "Enter shipping"
pay process as "Authorize card"
ok decision as "Approved?"
done terminal as "Order confirmed"
e1 = start -> addr [flow]
e2 = addr -> pay [flow]
e3 = pay -> ok [flow]
e4 = ok -> done [flow] as "Yes"
e5 = ok -> addr [flow] as "Retry"
`,
  },
  {
    id: 'c02-fc-decision-tree-down',
    title: 'Nested Support Triage Decision Tree (9 nodes, DOWN)',
    notation: 'flowchart',
    scale: 'medium',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['nested-decisions', 'edge-labels', 'multi-exit'],
    source: `@diagram flowchart
intake terminal as "Ticket opened"
sev decision as "Production down?"
page process as "Page on-call SRE"
bug decision as "Reproducible bug?"
docs process as "Send KB article"
triage process as "Log Jira defect"
fix predefined as "Run hotfix playbook"
verify process as "Verify recovery"
close terminal as "Ticket closed"
e1 = intake -> sev [flow]
e2 = sev -> page [flow] as "Yes"
e3 = sev -> bug [flow] as "No"
e4 = page -> fix [flow]
e5 = fix -> verify [flow]
e6 = verify -> close [flow]
e7 = bug -> triage [flow] as "Yes"
e8 = bug -> docs [flow] as "No"
e9 = triage -> close [flow]
e10 = docs -> close [flow]
`,
  },
  {
    id: 'c03-fc-release-ci-down',
    title: 'Release CI Pipeline with Loops & Rollback (13 nodes, DOWN)',
    notation: 'flowchart',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['back-edge-loop', 'multi-merge', 'edge-labels'],
    source: `@diagram flowchart
start terminal as "Release PR opened"
fetch io as "Load release manifest"
build process as "Compile all packages"
unitCheck decision as "Unit tests pass?"
fixUnit process as "Assign build failure"
e2eCheck decision as "Browser E2E green?"
secScan predefined as "Run security & license audit"
secCheck decision as "Audit approved?"
notes doc as "Generate release notes"
publish process as "Publish npm tarballs"
verify process as "Verify smoke install"
rollback process as "Tag incident & rollback"
done terminal as "Release live"
e1 = start -> fetch [flow]
e2 = fetch -> build [flow]
e3 = build -> unitCheck [flow]
e4 = unitCheck -> fixUnit [flow] as "No"
e5 = fixUnit -> build [flow]
e6 = unitCheck -> e2eCheck [flow] as "Yes"
e7 = e2eCheck -> rollback [flow] as "No"
e8 = e2eCheck -> secScan [flow] as "Yes"
e9 = secScan -> secCheck [flow]
e10 = secCheck -> rollback [flow] as "No"
e11 = secCheck -> notes [flow] as "Yes"
e12 = notes -> publish [flow]
e13 = publish -> verify [flow]
e14 = verify -> done [flow]
e15 = rollback -> done [flow]
`,
  },
  {
    id: 'c04-fc-release-ci-right',
    title: 'Release CI Pipeline with Loops & Rollback (13 nodes, RIGHT)',
    notation: 'flowchart',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['back-edge-loop', 'multi-merge', 'edge-labels'],
    source: `@diagram flowchart
start terminal as "Release PR opened"
fetch io as "Load release manifest"
build process as "Compile all packages"
unitCheck decision as "Unit tests pass?"
fixUnit process as "Assign build failure"
e2eCheck decision as "Browser E2E green?"
secScan predefined as "Run security & license audit"
secCheck decision as "Audit approved?"
notes doc as "Generate release notes"
publish process as "Publish npm tarballs"
verify process as "Verify smoke install"
rollback process as "Tag incident & rollback"
done terminal as "Release live"
e1 = start -> fetch [flow]
e2 = fetch -> build [flow]
e3 = build -> unitCheck [flow]
e4 = unitCheck -> fixUnit [flow] as "No"
e5 = fixUnit -> build [flow]
e6 = unitCheck -> e2eCheck [flow] as "Yes"
e7 = e2eCheck -> rollback [flow] as "No"
e8 = e2eCheck -> secScan [flow] as "Yes"
e9 = secScan -> secCheck [flow]
e10 = secCheck -> rollback [flow] as "No"
e11 = secCheck -> notes [flow] as "Yes"
e12 = notes -> publish [flow]
e13 = publish -> verify [flow]
e14 = verify -> done [flow]
e15 = rollback -> done [flow]
`,
  },
  {
    id: 'c05-fc-long-labels-down',
    title: 'Regulatory Compliance Review with Long Labels (10 nodes, DOWN)',
    notation: 'flowchart',
    scale: 'medium',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['long-labels', 'mixed-shapes', 'document-inset'],
    source: `@diagram flowchart
sub terminal as "Submit quarterly privacy impact filing"
collect io as "Gather processor sub-vendor telemetry logs"
spec doc as "Draft regulatory compliance attestation report"
check decision as "Zero unresolved high-severity findings?"
remediate predefined as "Execute mandatory engineering remediation sprint"
legal process as "General counsel statutory review"
sign doc as "Executive officer signed certification"
archive process as "Store immutable audit bundle in vault"
notify io as "Transmit filing confirmation to regulator"
done terminal as "Compliance cycle complete"
e1 = sub -> collect [flow]
e2 = collect -> spec [flow]
e3 = spec -> check [flow]
e4 = check -> remediate [flow] as "No"
e5 = remediate -> spec [flow]
e6 = check -> legal [flow] as "Yes"
e7 = legal -> sign [flow]
e8 = sign -> archive [flow]
e9 = archive -> notify [flow]
e10 = notify -> done [flow]
`,
  },
  {
    id: 'c06-fc-swimlane-grouped-right',
    title: 'Grouped Multi-Team Purchase Approval Flow (12 nodes, 3 groups, RIGHT)',
    notation: 'flowchart',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['grouped-containers', 'cross-boundary-edges', 'decision-branch'],
    source: `@diagram flowchart
req group as "Requester" {
  start terminal as "Draft purchase request"
  revise process as "Update vendor quote"
}
fin group as "Finance" {
  budget decision as "Within budget?"
  approve process as "Issue PO number"
  reject terminal as "Close rejected"
}
proc group as "Procurement" {
  vendorCheck predefined as "Verify vendor compliance"
  sendPo io as "Dispatch PO to vendor"
  receive doc as "Log invoice receipt"
  done terminal as "Payment scheduled"
}
e1 = req.start -> fin.budget [flow]
e2 = fin.budget -> req.revise [flow] as "Over"
e3 = req.revise -> fin.budget [flow]
e4 = fin.budget -> fin.approve [flow] as "OK"
e5 = fin.budget -> fin.reject [flow] as "Denied"
e6 = fin.approve -> proc.vendorCheck [flow]
e7 = proc.vendorCheck -> proc.sendPo [flow]
e8 = proc.sendPo -> proc.receive [flow]
e9 = proc.receive -> proc.done [flow]
`,
  },
  {
    id: 'c07-fc-dense-mesh-down',
    title: 'Enterprise Onboarding Stress Workflow (22 nodes, DOWN)',
    notation: 'flowchart',
    scale: 'stress',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['stress-20plus', 'multi-loop', 'skip-layer', 'multi-merge'],
    source: `@diagram flowchart
n01 terminal as "Contract signed"
n02 io as "Ingest customer roster"
n03 process as "Create tenant workspace"
n04 decision as "SSO required?"
n05 process as "Configure SAML IdP"
n06 process as "Enable email magic link"
n07 predefined as "Provision isolated DB schema"
n08 predefined as "Seed default RBAC roles"
n09 decision as "Data migration needed?"
n10 io as "Upload legacy CSV archive"
n11 process as "Validate schema mapping"
n12 decision as "Mapping clean?"
n13 process as "Repair malformed rows"
n14 process as "Run batch import job"
n15 process as "Configure webhook endpoints"
n16 process as "Run synthetic smoke suite"
n17 decision as "Smoke checks green?"
n18 process as "Escalate onboarding bug"
n19 doc as "Publish handoff runbook"
n20 io as "Send admin welcome packet"
n21 process as "Schedule 30-day QBR"
n22 terminal as "Tenant live"
e01 = n01 -> n02 [flow]
e02 = n02 -> n03 [flow]
e03 = n03 -> n04 [flow]
e04 = n04 -> n05 [flow] as "Yes"
e05 = n04 -> n06 [flow] as "No"
e06 = n05 -> n07 [flow]
e07 = n06 -> n07 [flow]
e08 = n07 -> n08 [flow]
e09 = n08 -> n09 [flow]
e10 = n09 -> n10 [flow] as "Yes"
e11 = n09 -> n15 [flow] as "No"
e12 = n10 -> n11 [flow]
e13 = n11 -> n12 [flow]
e14 = n12 -> n13 [flow] as "No"
e15 = n13 -> n11 [flow]
e16 = n12 -> n14 [flow] as "Yes"
e17 = n14 -> n15 [flow]
e18 = n15 -> n16 [flow]
e19 = n16 -> n17 [flow]
e20 = n17 -> n18 [flow] as "No"
e21 = n18 -> n16 [flow]
e22 = n17 -> n19 [flow] as "Yes"
e23 = n19 -> n20 [flow]
e24 = n20 -> n21 [flow]
e25 = n21 -> n22 [flow]
`,
  },

  // =========================================================================
  // ARCHITECTURE (9)
  // =========================================================================
  {
    id: 'c08-arch-3tier-small-right',
    title: 'Classic 3-Tier Web Architecture (6 nodes, RIGHT)',
    notation: 'architecture',
    scale: 'small',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['straight-spine', '2-way-fan-out', '2-way-fan-in'],
    source: `@diagram architecture
user actor [symbol: "arch-actor"] as "Web browser"
lb loadBalancer [symbol: "arch-load-balancer"] as "Ingress LB"
appA service [symbol: "arch-service"] as "Web API A"
appB service [symbol: "arch-service"] as "Web API B"
pg database [symbol: "arch-database"] as "Primary Postgres"
cache database [symbol: "arch-database"] as "Redis cache"
e1 = user -> lb [calls]
e2 = lb -> appA [calls]
e3 = lb -> appB [calls]
e4 = appA -> pg [writes]
e5 = appB -> pg [writes]
e6 = appA -> cache [reads]
e7 = appB -> cache [reads]
`,
  },
  {
    id: 'c09-arch-flat-large-right',
    title: 'Flat E-Commerce Cloud Architecture (13 nodes, RIGHT)',
    notation: 'architecture',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['3-way-fan-out', 'dual-db-fan-in', 'async-queue'],
    source: `@diagram architecture
webUser actor [symbol: "arch-actor"] as "Web customer"
mobileUser actor [symbol: "arch-actor"] as "Mobile app client"
cdn cdn [symbol: "arch-cdn"] as "Global edge CDN"
lb loadBalancer [symbol: "arch-load-balancer"] as "API load balancer"
auth service [symbol: "arch-service"] as "Auth & token service"
orders service [symbol: "arch-service"] as "Orders API service"
catalog service [symbol: "arch-service"] as "Catalog search service"
bus queue [symbol: "arch-queue"] as "Order events queue"
worker fn [symbol: "arch-function"] as "Async fulfillment worker"
pg database [symbol: "arch-database"] as "Primary Postgres DB"
blob storage [symbol: "arch-storage"] as "Invoice object storage"
stripe external [symbol: "arch-external-api"] as "Stripe payments API"
ship external [symbol: "arch-external-api"] as "Carrier shipping API"
e1 = webUser -> cdn [calls]
e2 = mobileUser -> lb [calls]
e3 = cdn -> lb [calls]
e4 = lb -> auth [calls]
e5 = lb -> orders [calls]
e6 = lb -> catalog [calls]
e7 = orders -> pg [writes]
e8 = catalog -> pg [reads]
e9 = orders -> bus [publishes]
e10 = orders -> stripe [calls]
e11 = bus -> worker [subscribes]
e12 = worker -> blob [writes]
e13 = worker -> ship [calls]
`,
  },
  {
    id: 'c10-arch-flat-large-down',
    title: 'Flat E-Commerce Cloud Architecture (13 nodes, DOWN)',
    notation: 'architecture',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['3-way-fan-out', 'dual-db-fan-in', 'outside-captions'],
    source: `@diagram architecture
webUser actor [symbol: "arch-actor"] as "Web customer"
mobileUser actor [symbol: "arch-actor"] as "Mobile app client"
cdn cdn [symbol: "arch-cdn"] as "Global edge CDN"
lb loadBalancer [symbol: "arch-load-balancer"] as "API load balancer"
auth service [symbol: "arch-service"] as "Auth & token service"
orders service [symbol: "arch-service"] as "Orders API service"
catalog service [symbol: "arch-service"] as "Catalog search service"
bus queue [symbol: "arch-queue"] as "Order events queue"
worker fn [symbol: "arch-function"] as "Async fulfillment worker"
pg database [symbol: "arch-database"] as "Primary Postgres DB"
blob storage [symbol: "arch-storage"] as "Invoice object storage"
stripe external [symbol: "arch-external-api"] as "Stripe payments API"
ship external [symbol: "arch-external-api"] as "Carrier shipping API"
e1 = webUser -> cdn [calls]
e2 = mobileUser -> lb [calls]
e3 = cdn -> lb [calls]
e4 = lb -> auth [calls]
e5 = lb -> orders [calls]
e6 = lb -> catalog [calls]
e7 = orders -> pg [writes]
e8 = catalog -> pg [reads]
e9 = orders -> bus [publishes]
e10 = orders -> stripe [calls]
e11 = bus -> worker [subscribes]
e12 = worker -> blob [writes]
e13 = worker -> ship [calls]
`,
  },
  {
    id: 'c11-arch-grouped-3zone-right',
    title: 'Grouped Cloud Microservices (14 nodes, 3 groups, RIGHT)',
    notation: 'architecture',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['grouped-containers', 'cross-boundary-edges', 'dual-db-fan-in', 'intra-group-alignment'],
    source: `@diagram architecture
client actor [symbol: "arch-actor"] as "Browser client"
edge group as "Edge & Ingress" {
  cdn cdn [symbol: "arch-cdn"] as "Edge CDN"
  lb loadBalancer [symbol: "arch-load-balancer"] as "Ingress ALB"
}
core group as "Core Microservices" {
  gw service [symbol: "arch-service"] as "API gateway"
  billing service [symbol: "arch-service"] as "Billing service"
  inventory service [symbol: "arch-service"] as "Inventory service"
  events queue [symbol: "arch-queue"] as "Domain event bus"
  notifier fn [symbol: "arch-function"] as "Webhook worker"
}
storage group as "Data & External" {
  db database [symbol: "arch-database"] as "Orders Postgres"
  s3 storage [symbol: "arch-storage"] as "Audit bucket"
  ext external [symbol: "arch-external-api"] as "Payment gateway"
}
e1 = client -> edge.cdn [calls]
e2 = edge.cdn -> edge.lb [calls]
e3 = edge.lb -> core.gw [calls]
e4 = core.gw -> core.billing [calls]
e5 = core.gw -> core.inventory [calls]
e6 = core.billing -> core.events [publishes]
e7 = core.events -> core.notifier [subscribes]
e8 = core.billing -> storage.db [writes]
e9 = core.inventory -> storage.db [reads]
e10 = core.billing -> storage.ext [calls]
e11 = core.notifier -> storage.s3 [writes]
`,
  },
  {
    id: 'c12-arch-grouped-3zone-down',
    title: 'Grouped Cloud Microservices (14 nodes, 3 groups, DOWN)',
    notation: 'architecture',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['grouped-containers', 'cross-boundary-edges', 'dual-db-fan-in', 'intra-group-alignment'],
    source: `@diagram architecture
client actor [symbol: "arch-actor"] as "Browser client"
edge group as "Edge & Ingress" {
  cdn cdn [symbol: "arch-cdn"] as "Edge CDN"
  lb loadBalancer [symbol: "arch-load-balancer"] as "Ingress ALB"
}
core group as "Core Microservices" {
  gw service [symbol: "arch-service"] as "API gateway"
  billing service [symbol: "arch-service"] as "Billing service"
  inventory service [symbol: "arch-service"] as "Inventory service"
  events queue [symbol: "arch-queue"] as "Domain event bus"
  notifier fn [symbol: "arch-function"] as "Webhook worker"
}
storage group as "Data & External" {
  db database [symbol: "arch-database"] as "Orders Postgres"
  s3 storage [symbol: "arch-storage"] as "Audit bucket"
  ext external [symbol: "arch-external-api"] as "Payment gateway"
}
e1 = client -> edge.cdn [calls]
e2 = edge.cdn -> edge.lb [calls]
e3 = edge.lb -> core.gw [calls]
e4 = core.gw -> core.billing [calls]
e5 = core.gw -> core.inventory [calls]
e6 = core.billing -> core.events [publishes]
e7 = core.events -> core.notifier [subscribes]
e8 = core.billing -> storage.db [writes]
e9 = core.inventory -> storage.db [reads]
e10 = core.billing -> storage.ext [calls]
e11 = core.notifier -> storage.s3 [writes]
`,
  },
  {
    id: 'c13-arch-nested-vpc-right',
    title: 'Nested VPC Public & Private Subnets (13 nodes, nested groups, RIGHT)',
    notation: 'architecture',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['nested-groups', 'cross-boundary-edges', 'intra-group-alignment'],
    source: `@diagram architecture
user actor [symbol: "arch-actor"] as "External user"
vpc group as "Production VPC" {
  pub group as "Public Subnet" {
    alb loadBalancer [symbol: "arch-load-balancer"] as "Public ALB"
    nat service [symbol: "arch-service"] as "NAT gateway"
  }
  priv group as "Private Subnet" {
    api service [symbol: "arch-service"] as "Core API"
    jobs fn [symbol: "arch-function"] as "Batch worker"
    q queue [symbol: "arch-queue"] as "Task queue"
  }
  data group as "Data Subnet" {
    rds database [symbol: "arch-database"] as "Aurora cluster"
    redis database [symbol: "arch-database"] as "ElastiCache"
  }
}
ext external [symbol: "arch-external-api"] as "Partner webhook"
e1 = user -> vpc.pub.alb [calls]
e2 = vpc.pub.alb -> vpc.priv.api [calls]
e3 = vpc.priv.api -> vpc.data.rds [writes]
e4 = vpc.priv.api -> vpc.data.redis [reads]
e5 = vpc.priv.api -> vpc.priv.q [publishes]
e6 = vpc.priv.q -> vpc.priv.jobs [subscribes]
e7 = vpc.priv.jobs -> vpc.data.rds [writes]
e8 = vpc.priv.jobs -> vpc.pub.nat [calls]
e9 = vpc.pub.nat -> ext [calls]
`,
  },
  {
    id: 'c14-arch-high-fanout-right',
    title: 'High-Degree 6-Way API Gateway Fan-Out (10 nodes, RIGHT)',
    notation: 'architecture',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['6-way-fan-out', 'port-spreading', 'corridor-separation'],
    source: `@diagram architecture
client actor [symbol: "arch-actor"] as "Mobile client"
gw loadBalancer [symbol: "arch-load-balancer"] as "API gateway"
s1 service [symbol: "arch-service"] as "Users service"
s2 service [symbol: "arch-service"] as "Catalog service"
s3 service [symbol: "arch-service"] as "Cart service"
s4 service [symbol: "arch-service"] as "Pricing service"
s5 service [symbol: "arch-service"] as "Reviews service"
s6 service [symbol: "arch-service"] as "Search service"
dbA database [symbol: "arch-database"] as "Core SQL DB"
dbB database [symbol: "arch-database"] as "Search index"
e1 = client -> gw [calls]
e2 = gw -> s1 [calls]
e3 = gw -> s2 [calls]
e4 = gw -> s3 [calls]
e5 = gw -> s4 [calls]
e6 = gw -> s5 [calls]
e7 = gw -> s6 [calls]
e8 = s1 -> dbA [writes]
e9 = s2 -> dbA [reads]
e10 = s3 -> dbA [writes]
e11 = s4 -> dbA [reads]
e12 = s5 -> dbB [writes]
e13 = s6 -> dbB [reads]
`,
  },
  {
    id: 'c15-arch-high-fanin-right',
    title: 'High-Degree 6-Way Telemetry Fan-In (10 nodes, RIGHT)',
    notation: 'architecture',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['6-way-fan-in', 'port-spreading', 'corridor-separation'],
    source: `@diagram architecture
s1 service [symbol: "arch-service"] as "Auth service"
s2 service [symbol: "arch-service"] as "Orders service"
s3 service [symbol: "arch-service"] as "Billing service"
s4 service [symbol: "arch-service"] as "Shipping service"
s5 service [symbol: "arch-service"] as "Search service"
s6 service [symbol: "arch-service"] as "Alerts service"
bus queue [symbol: "arch-queue"] as "Central Kafka bus"
ingest fn [symbol: "arch-function"] as "Log normalizer"
audit storage [symbol: "arch-storage"] as "Audit S3 archive"
siem external [symbol: "arch-external-api"] as "Cloud SIEM"
e1 = s1 -> bus [publishes]
e2 = s2 -> bus [publishes]
e3 = s3 -> bus [publishes]
e4 = s4 -> bus [publishes]
e5 = s5 -> bus [publishes]
e6 = s6 -> bus [publishes]
e7 = bus -> ingest [subscribes]
e8 = ingest -> audit [writes]
e9 = ingest -> siem [calls]
`,
  },
  {
    id: 'c16-arch-stress-24node-right',
    title: 'Full Multi-Region SaaS Platform Stress Test (24 nodes, 4 groups, RIGHT)',
    notation: 'architecture',
    scale: 'stress',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['stress-20plus', 'grouped-containers', 'cross-boundary-edges', 'high-edge-density'],
    source: `@diagram architecture
web actor [symbol: "arch-actor"] as "Web browser"
mob actor [symbol: "arch-actor"] as "iOS / Android"
partner actor [symbol: "arch-actor"] as "Partner API client"
edge group as "Edge Tier" {
  cdn cdn [symbol: "arch-cdn"] as "CloudFront CDN"
  waf loadBalancer [symbol: "arch-load-balancer"] as "WAF & ALB"
}
app group as "Application Tier" {
  gw service [symbol: "arch-service"] as "GraphQL gateway"
  auth service [symbol: "arch-service"] as "Identity service"
  acct service [symbol: "arch-service"] as "Accounts service"
  bill service [symbol: "arch-service"] as "Billing engine"
  usage service [symbol: "arch-service"] as "Metering service"
  proj service [symbol: "arch-service"] as "Projects API"
}
async group as "Async Workers" {
  kafka queue [symbol: "arch-queue"] as "Event backbone"
  mailer fn [symbol: "arch-function"] as "Email worker"
  pdf fn [symbol: "arch-function"] as "Invoice PDF worker"
  sync fn [symbol: "arch-function"] as "CRM sync worker"
}
data group as "Persistence & Third-Party" {
  pg database [symbol: "arch-database"] as "Primary Postgres"
  redis database [symbol: "arch-database"] as "Session Redis"
  s3 storage [symbol: "arch-storage"] as "Artifacts S3"
  stripe external [symbol: "arch-external-api"] as "Stripe API"
  sendgrid external [symbol: "arch-external-api"] as "SendGrid API"
}
e01 = web -> edge.cdn [calls]
e02 = mob -> edge.waf [calls]
e03 = partner -> edge.waf [calls]
e04 = edge.cdn -> edge.waf [calls]
e05 = edge.waf -> app.gw [calls]
e06 = app.gw -> app.auth [calls]
e07 = app.gw -> app.acct [calls]
e08 = app.gw -> app.bill [calls]
e09 = app.gw -> app.proj [calls]
e10 = app.auth -> data.redis [reads]
e11 = app.acct -> data.pg [writes]
e12 = app.proj -> data.pg [writes]
e13 = app.proj -> data.s3 [writes]
e14 = app.bill -> app.usage [calls]
e15 = app.bill -> data.stripe [calls]
e16 = app.bill -> async.kafka [publishes]
e17 = app.usage -> async.kafka [publishes]
e18 = async.kafka -> async.mailer [subscribes]
e19 = async.kafka -> async.pdf [subscribes]
e20 = async.kafka -> async.sync [subscribes]
e21 = async.mailer -> data.sendgrid [calls]
e22 = async.pdf -> data.s3 [writes]
e23 = async.sync -> data.pg [reads]
`,
  },

  // =========================================================================
  // DATA ENGINEERING (6)
  // =========================================================================
  {
    id: 'c17-de-medallion-medium-right',
    title: 'Medium Medallion ETL Pipeline (8 nodes, RIGHT)',
    notation: 'data-engineering',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['2-way-fan-in', '2-way-fan-out', 'outside-captions'],
    source: `@diagram data-engineering
pg source [symbol: "data-source"] as "Postgres OLTP replica"
kafka stream [symbol: "data-stream"] as "Clickstream events"
raw lake [symbol: "data-lake"] as "Raw S3 landing lake"
clean transform [symbol: "data-transform"] as "Spark deduplication & masking"
qual quality [symbol: "data-quality"] as "Great Expectations check"
dw warehouse [symbol: "data-warehouse"] as "Snowflake analytics warehouse"
bi dashboard [symbol: "data-dashboard"] as "Executive KPI dashboard"
ml sink [symbol: "data-sink"] as "Feature store export"
e1 = pg -> raw [batchFlow]
e2 = kafka -> raw [streamFlow]
e3 = raw -> clean [batchFlow]
e4 = clean -> qual [quality]
e5 = qual -> dw [batchFlow]
e6 = dw -> bi [batchFlow]
e7 = dw -> ml [batchFlow]
`,
  },
  {
    id: 'c18-de-medallion-large-right',
    title: 'Large Medallion Lakehouse Pipeline (15 nodes, RIGHT)',
    notation: 'data-engineering',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['3-way-fan-in', '4-way-fan-out', 'side-registry', 'rigid-block-alignment'],
    source: `@diagram data-engineering
web stream [symbol: "data-stream"] as "Web events stream"
cdc cdc [symbol: "data-cdc"] as "Billing DB CDC feed"
crm source [symbol: "data-source"] as "CRM nightly CSV drop"
bronze lake [symbol: "data-lake"] as "Bronze raw landing zone"
schema schema [symbol: "data-schema"] as "Avro schema registry"
enrich transform [symbol: "data-transform"] as "Sessionize & join user IDs"
agg transform [symbol: "data-transform"] as "Hourly revenue rollup"
dq quality [symbol: "data-quality"] as "Freshness & anomaly gate"
silver lake [symbol: "data-lake"] as "Silver conformed tables"
catalog catalog [symbol: "data-catalog"] as "Lineage & governance catalog"
gold warehouse [symbol: "data-warehouse"] as "Gold Snowflake warehouse"
execDash dashboard [symbol: "data-dashboard"] as "Finance & executive BI"
opsDash dashboard [symbol: "data-dashboard"] as "Live SLA operations board"
alerts sink [symbol: "data-sink"] as "PagerDuty webhook sink"
trainSink sink [symbol: "data-sink"] as "ML training parquet export"
e1 = web -> bronze [streamFlow]
e2 = cdc -> bronze [streamFlow]
e3 = crm -> bronze [batchFlow]
e4 = schema -> enrich [quality]
e5 = bronze -> enrich [batchFlow]
e6 = bronze -> agg [batchFlow]
e7 = enrich -> dq [quality]
e8 = agg -> dq [quality]
e9 = dq -> silver [batchFlow]
e10 = silver -> catalog [quality]
e11 = silver -> gold [batchFlow]
e12 = gold -> execDash [batchFlow]
e13 = gold -> opsDash [batchFlow]
e14 = gold -> alerts [streamFlow]
e15 = gold -> trainSink [batchFlow]
`,
  },
  {
    id: 'c19-de-medallion-large-down',
    title: 'Large Medallion Lakehouse Pipeline (15 nodes, DOWN)',
    notation: 'data-engineering',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['3-way-fan-in', '4-way-fan-out', 'side-registry', 'spine-balance'],
    source: `@diagram data-engineering
web stream [symbol: "data-stream"] as "Web events stream"
cdc cdc [symbol: "data-cdc"] as "Billing DB CDC feed"
crm source [symbol: "data-source"] as "CRM nightly CSV drop"
bronze lake [symbol: "data-lake"] as "Bronze raw landing zone"
schema schema [symbol: "data-schema"] as "Avro schema registry"
enrich transform [symbol: "data-transform"] as "Sessionize & join user IDs"
agg transform [symbol: "data-transform"] as "Hourly revenue rollup"
dq quality [symbol: "data-quality"] as "Freshness & anomaly gate"
silver lake [symbol: "data-lake"] as "Silver conformed tables"
catalog catalog [symbol: "data-catalog"] as "Lineage & governance catalog"
gold warehouse [symbol: "data-warehouse"] as "Gold Snowflake warehouse"
execDash dashboard [symbol: "data-dashboard"] as "Finance & executive BI"
opsDash dashboard [symbol: "data-dashboard"] as "Live SLA operations board"
alerts sink [symbol: "data-sink"] as "PagerDuty webhook sink"
trainSink sink [symbol: "data-sink"] as "ML training parquet export"
e1 = web -> bronze [streamFlow]
e2 = cdc -> bronze [streamFlow]
e3 = crm -> bronze [batchFlow]
e4 = schema -> enrich [quality]
e5 = bronze -> enrich [batchFlow]
e6 = bronze -> agg [batchFlow]
e7 = enrich -> dq [quality]
e8 = agg -> dq [quality]
e9 = dq -> silver [batchFlow]
e10 = silver -> catalog [quality]
e11 = silver -> gold [batchFlow]
e12 = gold -> execDash [batchFlow]
e13 = gold -> opsDash [batchFlow]
e14 = gold -> alerts [streamFlow]
e15 = gold -> trainSink [batchFlow]
`,
  },
  {
    id: 'c20-de-grouped-lakehouse-right',
    title: 'Grouped Medallion Zones (12 nodes, 3 groups, RIGHT)',
    notation: 'data-engineering',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['grouped-containers', 'cross-boundary-edges', 'intra-group-alignment'],
    source: `@diagram data-engineering
ingest group as "Ingestion" {
  erp source [symbol: "data-source"] as "ERP Postgres"
  events stream [symbol: "data-stream"] as "Kafka topic"
  bronze lake [symbol: "data-lake"] as "Bronze bucket"
}
curate group as "Curation" {
  dbt transform [symbol: "data-transform"] as "dbt staging models"
  tests quality [symbol: "data-quality"] as "Schema & null checks"
  silver lake [symbol: "data-lake"] as "Silver Iceberg"
}
serve group as "Serving" {
  gold warehouse [symbol: "data-warehouse"] as "Gold warehouse"
  bi dashboard [symbol: "data-dashboard"] as "Looker BI"
  revOps sink [symbol: "data-sink"] as "Reverse ETL sync"
}
e1 = ingest.erp -> ingest.bronze [batchFlow]
e2 = ingest.events -> ingest.bronze [streamFlow]
e3 = ingest.bronze -> curate.dbt [batchFlow]
e4 = curate.dbt -> curate.tests [quality]
e5 = curate.tests -> curate.silver [batchFlow]
e6 = curate.silver -> serve.gold [batchFlow]
e7 = serve.gold -> serve.bi [batchFlow]
e8 = serve.gold -> serve.revOps [batchFlow]
`,
  },
  {
    id: 'c21-de-6way-fanout-right',
    title: '6-Way Warehouse Fan-Out (9 nodes, RIGHT)',
    notation: 'data-engineering',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['6-way-fan-out', 'corridor-separation', 'port-spreading'],
    source: `@diagram data-engineering
src source [symbol: "data-source"] as "Core events DB"
etl transform [symbol: "data-transform"] as "Nightly rollup"
dw warehouse [symbol: "data-warehouse"] as "Enterprise warehouse"
d1 dashboard [symbol: "data-dashboard"] as "Finance BI"
d2 dashboard [symbol: "data-dashboard"] as "Sales pipeline"
d3 dashboard [symbol: "data-dashboard"] as "Product funnel"
d4 sink [symbol: "data-sink"] as "CRM enrichment"
d5 sink [symbol: "data-sink"] as "ML training export"
d6 sink [symbol: "data-sink"] as "Compliance archive"
e1 = src -> etl [batchFlow]
e2 = etl -> dw [batchFlow]
e3 = dw -> d1 [batchFlow]
e4 = dw -> d2 [batchFlow]
e5 = dw -> d3 [batchFlow]
e6 = dw -> d4 [batchFlow]
e7 = dw -> d5 [batchFlow]
e8 = dw -> d6 [batchFlow]
`,
  },
  {
    id: 'c22-de-streaming-lambda-right',
    title: 'Lambda Batch + Speed Dual-Path Pipeline (14 nodes, RIGHT)',
    notation: 'data-engineering',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['dual-parallel-lanes', 'merge-join', 'outside-captions'],
    source: `@diagram data-engineering
iot stream [symbol: "data-stream"] as "IoT telemetry stream"
app cdc [symbol: "data-cdc"] as "App state CDC"
router pipeline [symbol: "data-pipeline"] as "Dual-path splitter"
rawLake lake [symbol: "data-lake"] as "Immutable batch lake"
sparkBatch batch [symbol: "data-batch"] as "Hourly Spark batch"
batchViews warehouse [symbol: "data-warehouse"] as "Batch serving tables"
flink transform [symbol: "data-transform"] as "Flink 10s windowing"
speedCheck quality [symbol: "data-quality"] as "Outlier detector"
rtViews lake [symbol: "data-lake"] as "Real-time KV views"
merge transform [symbol: "data-transform"] as "Federated query layer"
ops dashboard [symbol: "data-dashboard"] as "Live NOC dashboard"
alert sink [symbol: "data-sink"] as "Anomaly webhook"
e1 = iot -> router [streamFlow]
e2 = app -> router [streamFlow]
e3 = router -> rawLake [batchFlow]
e4 = rawLake -> sparkBatch [batchFlow]
e5 = sparkBatch -> batchViews [batchFlow]
e6 = router -> flink [streamFlow]
e7 = flink -> speedCheck [quality]
e8 = speedCheck -> rtViews [streamFlow]
e9 = batchViews -> merge [batchFlow]
e10 = rtViews -> merge [streamFlow]
e11 = merge -> ops [batchFlow]
e12 = merge -> alert [streamFlow]
`,
  },

  // =========================================================================
  // AI / ML (6)
  // =========================================================================
  {
    id: 'c23-aiml-coralsmol-right',
    title: 'Coralsmol Fine-Tuning Pipeline with 67-Char Caption (8 nodes, RIGHT)',
    notation: 'aiml',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['long-captions', '2-way-fan-in', '2-way-fan-out', 'glyph-center-alignment'],
    source: `@diagram aiml
corpus dataset [symbol: "aiml-dataset"] as "Coral source corpus (examples, docs, tests)"
synth dataset [symbol: "aiml-dataset"] as "Synthetic prompt/answer pairs"
tok embedding [symbol: "aiml-embedding"] as "Tokenizer and packing"
base model [symbol: "aiml-model"] as "SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus"
sft training [symbol: "aiml-training"] as "Supervised fine-tuning"
tuned model [symbol: "aiml-model"] as "coralsmol fine-tuned model"
evalr evaluator [symbol: "aiml-evaluator"] as "Parser and validator pass rate"
serve inference [symbol: "aiml-inference"] as "Local inference"
a = corpus -> tok [embedding]
b = synth -> tok [embedding]
c = tok -> sft [training]
d = base -> sft [training]
e = sft -> tuned [training]
f = tuned -> evalr [inference]
g = tuned -> serve [inference]
`,
  },
  {
    id: 'c24-aiml-coralsmol-down',
    title: 'Coralsmol Fine-Tuning Pipeline with 67-Char Caption (8 nodes, DOWN)',
    notation: 'aiml',
    scale: 'medium',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['long-captions', '2-way-fan-in', '2-way-fan-out', 'no-chin-bar'],
    source: `@diagram aiml
corpus dataset [symbol: "aiml-dataset"] as "Coral source corpus (examples, docs, tests)"
synth dataset [symbol: "aiml-dataset"] as "Synthetic prompt/answer pairs"
tok embedding [symbol: "aiml-embedding"] as "Tokenizer and packing"
base model [symbol: "aiml-model"] as "SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus"
sft training [symbol: "aiml-training"] as "Supervised fine-tuning"
tuned model [symbol: "aiml-model"] as "coralsmol fine-tuned model"
evalr evaluator [symbol: "aiml-evaluator"] as "Parser and validator pass rate"
serve inference [symbol: "aiml-inference"] as "Local inference"
a = corpus -> tok [embedding]
b = synth -> tok [embedding]
c = tok -> sft [training]
d = base -> sft [training]
e = sft -> tuned [training]
f = tuned -> evalr [inference]
g = tuned -> serve [inference]
`,
  },
  {
    id: 'c25-aiml-rag-large-right',
    title: 'RAG & Guardrails Inference Pipeline (14 nodes, RIGHT)',
    notation: 'aiml',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['3-way-fan-in', '2-way-fan-out', 'multi-branch-merge', 'outside-captions'],
    source: `@diagram aiml
docs dataset [symbol: "aiml-dataset"] as "Enterprise docs & wikis"
tickets dataset [symbol: "aiml-dataset"] as "Support ticket archive"
code dataset [symbol: "aiml-dataset"] as "Repository source corpus"
embed embedding [symbol: "aiml-embedding"] as "Dense text embedder"
vec vectorStore [symbol: "aiml-vector-store"] as "Hybrid vector index"
ret retriever [symbol: "aiml-retriever"] as "Top-K semantic retriever"
agent agent [symbol: "aiml-agent"] as "Orchestrator agent"
guardIn guardrail [symbol: "aiml-guardrail"] as "PII & injection filter"
prompt prompt [symbol: "aiml-prompt"] as "System & RAG prompt builder"
gpu gpu [symbol: "aiml-gpu"] as "Inference GPU cluster"
llm llm [symbol: "aiml-llm"] as "Fine-tuned reasoning LLM"
guardOut guardrail [symbol: "aiml-guardrail"] as "Hallucination & policy check"
evalr evaluator [symbol: "aiml-evaluator"] as "Offline faithfulness eval"
serve inference [symbol: "aiml-inference"] as "Streaming API response"
e1 = docs -> embed [embedding]
e2 = tickets -> embed [embedding]
e3 = code -> embed [embedding]
e4 = embed -> vec [embedding]
e5 = vec -> ret [inference]
e6 = agent -> guardIn [inference]
e7 = guardIn -> prompt [inference]
e8 = ret -> prompt [inference]
e9 = prompt -> llm [inference]
e10 = gpu -> llm [training]
e11 = llm -> guardOut [inference]
e12 = guardOut -> evalr [inference]
e13 = guardOut -> serve [inference]
`,
  },
  {
    id: 'c26-aiml-rag-large-down',
    title: 'RAG & Guardrails Inference Pipeline (14 nodes, DOWN)',
    notation: 'aiml',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['3-way-fan-in', '2-way-fan-out', 'multi-branch-merge', 'outside-captions'],
    source: `@diagram aiml
docs dataset [symbol: "aiml-dataset"] as "Enterprise docs & wikis"
tickets dataset [symbol: "aiml-dataset"] as "Support ticket archive"
code dataset [symbol: "aiml-dataset"] as "Repository source corpus"
embed embedding [symbol: "aiml-embedding"] as "Dense text embedder"
vec vectorStore [symbol: "aiml-vector-store"] as "Hybrid vector index"
ret retriever [symbol: "aiml-retriever"] as "Top-K semantic retriever"
agent agent [symbol: "aiml-agent"] as "Orchestrator agent"
guardIn guardrail [symbol: "aiml-guardrail"] as "PII & injection filter"
prompt prompt [symbol: "aiml-prompt"] as "System & RAG prompt builder"
gpu gpu [symbol: "aiml-gpu"] as "Inference GPU cluster"
llm llm [symbol: "aiml-llm"] as "Fine-tuned reasoning LLM"
guardOut guardrail [symbol: "aiml-guardrail"] as "Hallucination & policy check"
evalr evaluator [symbol: "aiml-evaluator"] as "Offline faithfulness eval"
serve inference [symbol: "aiml-inference"] as "Streaming API response"
e1 = docs -> embed [embedding]
e2 = tickets -> embed [embedding]
e3 = code -> embed [embedding]
e4 = embed -> vec [embedding]
e5 = vec -> ret [inference]
e6 = agent -> guardIn [inference]
e7 = guardIn -> prompt [inference]
e8 = ret -> prompt [inference]
e9 = prompt -> llm [inference]
e10 = gpu -> llm [training]
e11 = llm -> guardOut [inference]
e12 = guardOut -> evalr [inference]
e13 = guardOut -> serve [inference]
`,
  },
  {
    id: 'c27-aiml-multi-agent-right',
    title: 'Multi-Agent Tool Orchestration Diamond (11 nodes, RIGHT)',
    notation: 'aiml',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['4-way-fan-out', '4-way-fan-in', 'diamond-symmetry'],
    source: `@diagram aiml
req prompt [symbol: "aiml-prompt"] as "User task prompt"
planner agent [symbol: "aiml-agent"] as "Planner orchestrator"
tSearch tool [symbol: "aiml-tool"] as "Web search tool"
tSql tool [symbol: "aiml-tool"] as "SQL analytics tool"
tCode tool [symbol: "aiml-tool"] as "Code sandbox"
tMem memory [symbol: "aiml-memory"] as "Long-term memory"
synth llm [symbol: "aiml-llm"] as "Synthesis LLM"
guard guardrail [symbol: "aiml-guardrail"] as "Safety verifier"
evalr evaluator [symbol: "aiml-evaluator"] as "Quality scorer"
out inference [symbol: "aiml-inference"] as "Final response"
e1 = req -> planner [inference]
e2 = planner -> tSearch [inference]
e3 = planner -> tSql [inference]
e4 = planner -> tCode [inference]
e5 = planner -> tMem [inference]
e6 = tSearch -> synth [inference]
e7 = tSql -> synth [inference]
e8 = tCode -> synth [inference]
e9 = tMem -> synth [inference]
e10 = synth -> guard [inference]
e11 = guard -> evalr [inference]
e12 = guard -> out [inference]
`,
  },
  {
    id: 'c28-aiml-grouped-mlops-right',
    title: 'Grouped MLOps Training & Serving Platform (12 nodes, 3 groups, RIGHT)',
    notation: 'aiml',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['grouped-containers', 'cross-boundary-edges', 'intra-group-alignment'],
    source: `@diagram aiml
data group as "Data Preparation" {
  raw dataset [symbol: "aiml-dataset"] as "Raw corpora"
  feat featureStore [symbol: "aiml-feature-store"] as "Feature store"
  emb embedding [symbol: "aiml-embedding"] as "Embedding job"
}
train group as "Training & Eval" {
  gpu gpu [symbol: "aiml-gpu"] as "H100 cluster"
  sft training [symbol: "aiml-training"] as "LoRA fine-tuning"
  evalr evaluator [symbol: "aiml-evaluator"] as "Benchmark harness"
}
prod group as "Production Serving" {
  model llm [symbol: "aiml-llm"] as "Quantized weights"
  guard guardrail [symbol: "aiml-guardrail"] as "Policy guardrail"
  api inference [symbol: "aiml-inference"] as "vLLM endpoint"
}
e1 = data.raw -> data.feat [embedding]
e2 = data.feat -> data.emb [embedding]
e3 = data.emb -> train.sft [training]
e4 = train.gpu -> train.sft [training]
e5 = train.sft -> train.evalr [training]
e6 = train.evalr -> prod.model [inference]
e7 = prod.model -> prod.guard [inference]
e8 = prod.guard -> prod.api [inference]
`,
  },

  // =========================================================================
  // BPMN (4)
  // =========================================================================
  {
    id: 'c29-bpmn-order-fulfill-right',
    title: 'Order Fulfillment BPMN with Parallel Gateways (12 nodes, RIGHT)',
    notation: 'bpmn',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['gateway-split-merge', 'data-store-association', 'edge-labels'],
    source: `@diagram bpmn
start event [symbol: "bpmn-start-event"] as "Order received"
validate task [symbol: "bpmn-task"] as "Validate cart & address"
stockCheck gateway [symbol: "bpmn-gateway-exclusive"] as "In stock?"
reject task [symbol: "bpmn-task"] as "Notify out of stock"
endReject event [symbol: "bpmn-end-event"] as "Order cancelled"
split gateway [symbol: "bpmn-gateway-parallel"] as "Fulfill parallel"
charge task [symbol: "bpmn-task"] as "Capture payment"
pack task [symbol: "bpmn-task"] as "Pack warehouse shipment"
ledger dataStore [symbol: "bpmn-data-store"] as "Order ledger"
join gateway [symbol: "bpmn-gateway-parallel"] as "Sync fulfillment"
ship task [symbol: "bpmn-task"] as "Dispatch courier"
done event [symbol: "bpmn-end-event"] as "Order delivered"
e1 = start -> validate [sequence]
e2 = validate -> stockCheck [sequence]
e3 = stockCheck -> reject [sequence] as "No"
e4 = reject -> endReject [sequence]
e5 = stockCheck -> split [sequence] as "Yes"
e6 = split -> charge [sequence]
e7 = split -> pack [sequence]
e8 = charge -> ledger [association]
e9 = charge -> join [sequence]
e10 = pack -> join [sequence]
e11 = join -> ship [sequence]
e12 = ship -> done [sequence]
`,
  },
  {
    id: 'c30-bpmn-order-fulfill-down',
    title: 'Order Fulfillment BPMN (12 nodes, DOWN)',
    notation: 'bpmn',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['gateway-split-merge', 'data-store-association', 'edge-labels'],
    source: `@diagram bpmn
start event [symbol: "bpmn-start-event"] as "Order received"
validate task [symbol: "bpmn-task"] as "Validate cart & address"
stockCheck gateway [symbol: "bpmn-gateway-exclusive"] as "In stock?"
reject task [symbol: "bpmn-task"] as "Notify out of stock"
endReject event [symbol: "bpmn-end-event"] as "Order cancelled"
split gateway [symbol: "bpmn-gateway-parallel"] as "Fulfill parallel"
charge task [symbol: "bpmn-task"] as "Capture payment"
pack task [symbol: "bpmn-task"] as "Pack warehouse shipment"
ledger dataStore [symbol: "bpmn-data-store"] as "Order ledger"
join gateway [symbol: "bpmn-gateway-parallel"] as "Sync fulfillment"
ship task [symbol: "bpmn-task"] as "Dispatch courier"
done event [symbol: "bpmn-end-event"] as "Order delivered"
e1 = start -> validate [sequence]
e2 = validate -> stockCheck [sequence]
e3 = stockCheck -> reject [sequence] as "No"
e4 = reject -> endReject [sequence]
e5 = stockCheck -> split [sequence] as "Yes"
e6 = split -> charge [sequence]
e7 = split -> pack [sequence]
e8 = charge -> ledger [association]
e9 = charge -> join [sequence]
e10 = pack -> join [sequence]
e11 = join -> ship [sequence]
e12 = ship -> done [sequence]
`,
  },
  {
    id: 'c31-bpmn-grouped-pools-right',
    title: 'Cross-Pool BPMN Customer & Support Collaboration (11 nodes, 2 groups, RIGHT)',
    notation: 'bpmn',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['grouped-containers', 'cross-boundary-edges', 'message-flow'],
    source: `@diagram bpmn
cust group as "Customer" {
  cStart event [symbol: "bpmn-start-event"] as "Issue noticed"
  cSubmit task [symbol: "bpmn-task"] as "Submit claim"
  cConfirm task [symbol: "bpmn-task"] as "Confirm resolution"
  cEnd event [symbol: "bpmn-end-event"] as "Claim closed"
}
supp group as "Support Desk" {
  sRecv event [symbol: "bpmn-start-event"] as "Claim received"
  sVerify task [symbol: "bpmn-task"] as "Inspect warranty"
  sGate gateway [symbol: "bpmn-gateway-exclusive"] as "Valid?"
  sRefund task [symbol: "bpmn-task"] as "Issue refund"
  sDeny task [symbol: "bpmn-task"] as "Send denial"
}
e1 = cust.cStart -> cust.cSubmit [sequence]
e2 = cust.cSubmit -> supp.sRecv [message]
e3 = supp.sRecv -> supp.sVerify [sequence]
e4 = supp.sVerify -> supp.sGate [sequence]
e5 = supp.sGate -> supp.sRefund [sequence] as "Yes"
e6 = supp.sGate -> supp.sDeny [sequence] as "No"
e7 = supp.sRefund -> cust.cConfirm [message]
e8 = supp.sDeny -> cust.cConfirm [message]
e9 = cust.cConfirm -> cust.cEnd [sequence]
`,
  },
  {
    id: 'c32-bpmn-exception-loop-right',
    title: 'Document Review BPMN with Rework Cycle (10 nodes, RIGHT)',
    notation: 'bpmn',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['back-edge-loop', 'gateway-split-merge', 'edge-labels'],
    source: `@diagram bpmn
start event [symbol: "bpmn-start-event"] as "RFC opened"
draft task [symbol: "bpmn-task"] as "Author technical spec"
review task [symbol: "bpmn-task"] as "Peer review panel"
ok gateway [symbol: "bpmn-gateway-exclusive"] as "Approved?"
rework task [symbol: "bpmn-task"] as "Address review notes"
sec task [symbol: "bpmn-task"] as "Security sign-off"
secOk gateway [symbol: "bpmn-gateway-exclusive"] as "Safe?"
publish task [symbol: "bpmn-task"] as "Publish RFC"
archive dataStore [symbol: "bpmn-data-store"] as "RFC registry"
done event [symbol: "bpmn-end-event"] as "RFC ratified"
e1 = start -> draft [sequence]
e2 = draft -> review [sequence]
e3 = review -> ok [sequence]
e4 = ok -> rework [sequence] as "Changes"
e5 = rework -> review [sequence]
e6 = ok -> sec [sequence] as "Yes"
e7 = sec -> secOk [sequence]
e8 = secOk -> rework [sequence] as "Blocked"
e9 = secOk -> publish [sequence] as "Pass"
e10 = publish -> archive [association]
e11 = publish -> done [sequence]
`,
  },

  // =========================================================================
  // CODE / DEPENDENCY (3)
  // =========================================================================
  {
    id: 'c33-code-compiler-right',
    title: 'Coral Compiler & Renderer Call Graph (10 nodes, RIGHT)',
    notation: 'code',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['diamond-dependency', 'skip-layer', 'mixed-shapes'],
    source: `@diagram code
cli module [symbol: "code-module"] as "CLI entrypoint"
parser module [symbol: "code-module"] as "DSL parser"
ast type [symbol: "code-type"] as "Document AST"
validator fn [symbol: "code-function"] as "validateSemantics()"
elk ext [symbol: "code-external"] as "elkjs layout engine"
spatial module [symbol: "code-module"] as "Spatial layout solver"
align fn [symbol: "code-function"] as "alignVisualFlow()"
scene module [symbol: "code-module"] as "Render scene builder"
svg fn [symbol: "code-function"] as "renderSvg()"
canvas cls [symbol: "code-class"] as "ShapeRenderer"
e1 = cli -> parser [imports]
e2 = parser -> ast [returns]
e3 = cli -> validator [calls]
e4 = validator -> ast [uses]
e5 = cli -> spatial [calls]
e6 = spatial -> elk [imports]
e7 = spatial -> align [calls]
e8 = spatial -> scene [calls]
e9 = scene -> svg [calls]
e10 = scene -> canvas [calls]
`,
  },
  {
    id: 'c34-code-monorepo-dag-down',
    title: 'Monorepo Package Dependency DAG (14 nodes, DOWN)',
    notation: 'code',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['skip-layer', 'multi-fan-in', 'diamond-dependency'],
    source: `@diagram code
editor module [symbol: "code-module"] as "diagram-editor"
mcp module [symbol: "code-module"] as "mcp-server"
browser module [symbol: "code-module"] as "browser-bundle"
viz module [symbol: "code-module"] as "viz-components"
render module [symbol: "code-module"] as "render-core"
lang module [symbol: "code-module"] as "language-dsl"
layout module [symbol: "code-module"] as "spatial-layout"
shapes module [symbol: "code-module"] as "shape-catalog"
fonts module [symbol: "code-module"] as "font-metrics"
elk ext [symbol: "code-external"] as "elkjs"
avoid ext [symbol: "code-external"] as "libavoided-js"
gir ext [symbol: "code-external"] as "@graph-ir/core"
ts ext [symbol: "code-external"] as "tree-sitter"
react ext [symbol: "code-external"] as "react"
e01 = editor -> viz [imports]
e02 = editor -> render [imports]
e03 = editor -> lang [imports]
e04 = mcp -> render [imports]
e05 = mcp -> lang [imports]
e06 = browser -> render [imports]
e07 = browser -> lang [imports]
e08 = viz -> render [imports]
e09 = viz -> react [imports]
e10 = render -> layout [imports]
e11 = render -> shapes [imports]
e12 = render -> fonts [imports]
e13 = render -> gir [imports]
e14 = lang -> gir [imports]
e15 = lang -> ts [imports]
e16 = layout -> elk [imports]
e17 = layout -> avoid [imports]
`,
  },
  {
    id: 'c35-code-layered-grouped-right',
    title: 'Grouped Layered Software Modules (12 nodes, 3 groups, RIGHT)',
    notation: 'code',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['grouped-containers', 'cross-boundary-edges', 'intra-group-alignment'],
    source: `@diagram code
ui group as "Presentation Layer" {
  app cls [symbol: "code-class"] as "EditorShell"
  canvas cls [symbol: "code-class"] as "DiagramCanvas"
  panel cls [symbol: "code-class"] as "InspectorPanel"
}
domain group as "Domain Layer" {
  store cls [symbol: "code-class"] as "DocumentStore"
  cmds fn [symbol: "code-function"] as "applyCommand()"
  valid fn [symbol: "code-function"] as "checkConstraints()"
}
infra group as "Infrastructure" {
  io module [symbol: "code-module"] as "FileStorage"
  worker module [symbol: "code-module"] as "LayoutWorker"
  exportMod fn [symbol: "code-function"] as "exportSvg()"
}
e1 = ui.app -> ui.canvas [calls]
e2 = ui.app -> ui.panel [calls]
e3 = ui.canvas -> domain.store [uses]
e4 = ui.panel -> domain.cmds [calls]
e5 = domain.cmds -> domain.valid [calls]
e6 = domain.cmds -> domain.store [uses]
e7 = domain.store -> infra.io [calls]
e8 = domain.store -> infra.worker [calls]
e9 = ui.canvas -> infra.exportMod [calls]
`,
  },

  // =========================================================================
  // BLOCK & SKETCH (3)
  // =========================================================================
  {
    id: 'c36-block-pid-feedback-right',
    title: 'Closed-Loop PID Control System (10 nodes, RIGHT)',
    notation: 'block',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['long-feedback-edge', 'straight-spine'],
    source: `@diagram block
ref block as "Target setpoint"
sum block as "Error summer"
pid block as "PID controller"
limit block as "Actuator limiter"
motor block as "Brushless motor"
gear block as "Gearbox stage"
load block as "Robotic arm load"
enc block as "Optical encoder"
filt block as "Kalman filter"
log block as "Telemetry logger"
e1 = ref -> sum
e2 = sum -> pid
e3 = pid -> limit
e4 = limit -> motor
e5 = motor -> gear
e6 = gear -> load
e7 = load -> enc
e8 = load -> log
e9 = enc -> filt
e10 = filt -> sum
`,
  },
  {
    id: 'c37-block-dsp-parallel-right',
    title: 'Parallel Multi-Band DSP Filter Bank (12 nodes, RIGHT)',
    notation: 'block',
    scale: 'large',
    direction: 'RIGHT',
    style: 'hifi',
    stressors: ['4-way-fan-out', '4-way-fan-in', 'diamond-symmetry'],
    source: `@diagram block
adc block as "24-bit ADC"
pre block as "DC blocker"
low block as "Low-pass FIR"
midL block as "Low-mid BPF"
midH block as "High-mid BPF"
high block as "High-pass FIR"
g1 block as "Band 1 gain"
g2 block as "Band 2 gain"
g3 block as "Band 3 gain"
g4 block as "Band 4 gain"
mix block as "Master summer"
dac block as "Stereo DAC"
e01 = adc -> pre
e02 = pre -> low
e03 = pre -> midL
e04 = pre -> midH
e05 = pre -> high
e06 = low -> g1
e07 = midL -> g2
e08 = midH -> g3
e09 = high -> g4
e10 = g1 -> mix
e11 = g2 -> mix
e12 = g3 -> mix
e13 = g4 -> mix
e14 = mix -> dac
`,
  },
  {
    id: 'c38-sketch-product-loop-right',
    title: 'Product Discovery Loop Sketch (8 nodes, lowfi, RIGHT)',
    notation: 'sketch',
    scale: 'medium',
    direction: 'RIGHT',
    style: 'lowfi',
    stressors: ['lowfi-style', 'back-edge-loop', 'edge-labels'],
    source: `@diagram sketch
idea cloud [symbol: "sketch-cloud"] as "Product spark"
research step [symbol: "sketch-step"] as "Talk to 5 users"
proto box [symbol: "sketch-box"] as "Clickable mockup"
valid decision [symbol: "sketch-decision"] as "Solves real pain?"
pivot step [symbol: "sketch-step"] as "Reframe problem"
build box [symbol: "sketch-box"] as "Ship thin vertical slice"
beta circle [symbol: "sketch-circle"] as "Beta cohort"
launch cloud [symbol: "sketch-cloud"] as "Public launch"
e1 = idea -> research
e2 = research -> proto
e3 = proto -> valid
e4 = valid -> pivot as "Not yet"
e5 = pivot -> proto
e6 = valid -> build as "Yes!"
e7 = build -> beta
e8 = beta -> launch
`,
  },

  // =========================================================================
  // UML CLASS (2)
  // =========================================================================
  {
    id: 'c39-uml-hierarchy-down',
    title: 'Scene Graph Class Hierarchy (8 classes, DOWN)',
    notation: 'uml-class',
    scale: 'medium',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['inheritance-tree', 'composition-edges'],
    source: `@diagram uml-class
drawable interface [symbol: "uml-interface"] as "Drawable"
node cls [symbol: "uml-class"] as "SceneNode"
edge cls [symbol: "uml-class"] as "SceneEdge"
stencil cls [symbol: "uml-class"] as "StencilNode"
container cls [symbol: "uml-class"] as "ContainerNode"
userSym cls [symbol: "uml-class"] as "UserSymbolNode"
port cls [symbol: "uml-class"] as "PortAnchor"
scene cls [symbol: "uml-class"] as "RenderScene"
e1 = node -> drawable [realization]
e2 = edge -> drawable [realization]
e3 = stencil -> node [inheritance]
e4 = container -> node [inheritance]
e5 = userSym -> stencil [inheritance]
e6 = node -> port [composition]
e7 = scene -> node [composition]
e8 = scene -> edge [composition]
`,
  },
  {
    id: 'c40-uml-domain-large-down',
    title: 'E-Commerce Domain Class Model (14 classes, DOWN)',
    notation: 'uml-class',
    scale: 'large',
    direction: 'DOWN',
    style: 'hifi',
    stressors: ['inheritance-tree', 'multi-association', 'skip-layer'],
    source: `@diagram uml-class
entity interface [symbol: "uml-interface"] as "Entity"
user cls [symbol: "uml-class"] as "Account"
cust cls [symbol: "uml-class"] as "Customer"
admin cls [symbol: "uml-class"] as "Admin"
cart cls [symbol: "uml-class"] as "ShoppingCart"
order cls [symbol: "uml-class"] as "Order"
item cls [symbol: "uml-class"] as "OrderLineItem"
prod cls [symbol: "uml-class"] as "Product"
sku cls [symbol: "uml-class"] as "InventorySku"
pay cls [symbol: "uml-class"] as "Payment"
card cls [symbol: "uml-class"] as "CardPayment"
wire cls [symbol: "uml-class"] as "BankTransfer"
ship cls [symbol: "uml-class"] as "Shipment"
status enum [symbol: "uml-enum"] as "OrderStatus"
e01 = user -> entity [realization]
e02 = order -> entity [realization]
e03 = cust -> user [inheritance]
e04 = admin -> user [inheritance]
e05 = cust -> cart [composition]
e06 = cust -> order [association]
e07 = order -> item [composition]
e08 = item -> prod [association]
e09 = prod -> sku [composition]
e10 = order -> pay [composition]
e11 = card -> pay [inheritance]
e12 = wire -> pay [inheritance]
e13 = order -> ship [composition]
e14 = order -> status [association]
`,
  },
];
