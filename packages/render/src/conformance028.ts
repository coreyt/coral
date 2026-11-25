/** Approved U2 report mechanics; profile rule cards are supplied separately. */
import type { SourceRange028 } from './portReferences028.js';

export type ConformanceLevel = 'none' | 'typical' | 'strict';
export type NotificationLevel = 'error' | 'warning' | 'info' | 'debug';
export type FindingCategory = 'notation' | 'syntax' | 'integrity' | 'capability';

export interface SymbolCause {
  kind: 'explicit-symbol';
  nodeId: string;
  symbol: string;
}
export type RuleCause = SymbolCause | { kind: 'other'; key: string };

export interface RuleFinding {
  id: string;
  category: FindingCategory;
  /** Required for notation findings; ignored for independent categories. */
  minimumLevel?: 'typical' | 'strict';
  severity: NotificationLevel;
  message: string;
  /** RFC 6901 location for an independent portable-model finding. */
  path?: string;
  /** Exact authored token range when a source-to-model map is available. */
  range?: SourceRange028;
  subject?: { kind: 'node' | 'edge' | 'graph' | 'activation' | 'note' | 'fragment'; id: string };
  causes?: readonly RuleCause[];
  provenance?: { kind: 'standard' | 'coral'; reference: string };
  /** The authored object whose evidence the rule inspects. */
  evidenceScope?: 'graph' | 'node' | 'edge';
  remediation?: string;
}

export interface RuleDefinition<T> {
  id: string;
  minimumLevel: 'typical' | 'strict';
  /** Severity at the minimum level, and at strict when no override is given. */
  severity: NotificationLevel;
  /** A typical rule may become louder under strict without changing meaning. */
  strictSeverity?: NotificationLevel;
  provenance: { kind: 'standard' | 'coral'; reference: string };
  evidenceScope: 'graph' | 'node' | 'edge';
  remediation: string;
  check: (context: T) => readonly {
    message: string;
    subject?: RuleFinding['subject'];
    causes?: readonly RuleCause[];
  }[];
}

export interface RulesetDefinition<T> {
  id: string;
  profileId: string;
  version: string;
  /** Bounds a reviewed Coral inventory; never an external-standard certification. */
  scope?: 'coral-bounded-profile';
  /** Omission is partial; only reviewed complete cards may certify a profile. */
  coverage?: 'partial' | 'complete';
  obligations?: readonly { id: string; message: string }[];
  rules: readonly RuleDefinition<T>[];
}

export interface SymbolException {
  nodeId: string;
  symbol: string;
}

export interface ConformanceRequest {
  savedLevel?: ConformanceLevel;
  requestedLevel?: ConformanceLevel;
  notificationLevel?: NotificationLevel;
  operation?: 'edit' | 'save' | 'close' | 'check';
}

export interface ConformanceReport {
  evaluatedLevel: ConformanceLevel;
  /** Installed interpretation catalog; present for graph-level profile checks. */
  catalog?: { id: string; version: string; digest: string };
  findings: readonly RuleFinding[];
  notices: readonly RuleFinding[];
  exceptions: readonly (SymbolException & { affectedRuleIds: readonly string[] })[];
  unverifiedObligations: readonly { id: string; message: string }[];
  claimStatus: 'not-claimed' | 'failed' | 'unverified' | 'conformant' | 'conformant-with-exceptions';
  ruleset?: { id: string; profileId: string; version: string; scope?: 'coral-bounded-profile' };
}

function claimStatus(
  request: ConformanceRequest,
  level: ConformanceLevel,
  findings: readonly RuleFinding[],
  obligations: readonly { id: string; message: string }[],
  exceptions: ConformanceReport['exceptions'],
): ConformanceReport['claimStatus'] {
  if (request.operation !== 'check' || level !== 'strict') return 'not-claimed';
  if (findings.some((finding) => finding.severity === 'error')) return 'failed';
  if (obligations.length) return 'unverified';
  return exceptions.some((exception) => exception.affectedRuleIds.length)
    ? 'conformant-with-exceptions' : 'conformant';
}

export function evaluateConformance028(
  request: ConformanceRequest,
  input: readonly RuleFinding[],
  exceptions: readonly SymbolException[] = [],
): ConformanceReport {
  const evaluatedLevel = request.requestedLevel ?? request.savedLevel ?? 'typical';
  const rank: Record<NotificationLevel, number> = { error: 0, warning: 1, info: 2, debug: 3 };
  const threshold = rank[request.notificationLevel ?? 'error'];
  const affected = new Map(exceptions.map((exception) => [exception, new Set<string>()]));
  const findings = input.filter((finding) => {
    if (finding.category !== 'notation') return true;
    if (evaluatedLevel === 'none') return false;
    return evaluatedLevel === 'strict' || finding.minimumLevel === 'typical';
  }).map((finding) => {
    if (evaluatedLevel !== 'strict' || finding.category !== 'notation' ||
      finding.severity !== 'error' || !finding.causes?.length) return finding;
    const exempt = finding.causes.every((cause) => cause.kind === 'explicit-symbol' &&
      exceptions.some((exception) => cause.nodeId === exception.nodeId && cause.symbol === exception.symbol));
    if (exempt) for (const exception of exceptions) {
      if (finding.causes.some((cause) => cause.kind === 'explicit-symbol' &&
        cause.nodeId === exception.nodeId && cause.symbol === exception.symbol)) affected.get(exception)!.add(finding.id);
    }
    return exempt ? { ...finding, severity: 'warning' as const } : finding;
  });
  const quiet = request.operation === 'save' || request.operation === 'close';
  const notices = findings.filter((finding) =>
    (!quiet || finding.category !== 'notation') && rank[finding.severity] <= threshold);
  const reportedExceptions = exceptions.map((exception) => ({ ...exception,
    affectedRuleIds: [...affected.get(exception)!] }));
  const unverifiedObligations = [{ id: 'CORAL.RULESET.COVERAGE.UNSPECIFIED',
    message: 'Complete versioned rule coverage has not been established' }];
  return { evaluatedLevel, findings, notices, exceptions: reportedExceptions,
    unverifiedObligations,
    claimStatus: claimStatus(request, evaluatedLevel, findings, unverifiedObligations, reportedExceptions) };
}

function assertRulesetEvidence028<T>(ruleset: RulesetDefinition<T>): void {
  if (!ruleset.id.trim() || !ruleset.version.trim()) {
    throw new Error(`Ruleset ${ruleset.profileId} needs a nonempty ID and version`);
  }
  const ids = new Set<string>();
  for (const rule of ruleset.rules) {
    if (!rule.id.trim()) throw new Error(`Ruleset ${ruleset.id} has an empty rule ID`);
    if (ids.has(rule.id)) throw new Error(`Ruleset ${ruleset.id} has duplicate rule ID ${rule.id}`);
    ids.add(rule.id);
    if (!rule.provenance.reference.trim()) {
      throw new Error(`Rule ${rule.id} needs a nonempty provenance reference`);
    }
    if (!rule.remediation.trim()) throw new Error(`Rule ${rule.id} needs nonempty remediation`);
  }
}

/** Execute one versioned profile ruleset, then apply the independent notice policy. */
export function runRuleset028<T>(
  profileId: string,
  context: T,
  ruleset: RulesetDefinition<T>,
  request: ConformanceRequest,
  exceptions: readonly SymbolException[] = [],
  independentFindings: readonly RuleFinding[] = [],
  independentObligations: readonly { id: string; message: string }[] = [],
): ConformanceReport {
  if (ruleset.profileId !== profileId) {
    throw new Error(`Ruleset profile ${ruleset.profileId} does not match ${profileId}`);
  }
  assertRulesetEvidence028(ruleset);
  const level = request.requestedLevel ?? request.savedLevel ?? 'typical';
  const findings: RuleFinding[] = [];
  for (const rule of ruleset.rules) {
    if (level === 'none' || (level === 'typical' && rule.minimumLevel === 'strict')) continue;
    for (const result of rule.check(context)) {
      findings.push({ id: rule.id, category: 'notation', minimumLevel: rule.minimumLevel,
        severity: level === 'strict' ? (rule.strictSeverity ?? rule.severity) : rule.severity,
        message: result.message, provenance: rule.provenance,
        evidenceScope: rule.evidenceScope, remediation: rule.remediation,
        ...(result.subject ? { subject: result.subject } : {}),
        ...(result.causes ? { causes: result.causes } : {}) });
    }
  }
  const report = evaluateConformance028(request, [...findings, ...independentFindings], exceptions);
  const rulesetObligations = ruleset.coverage === 'complete' ? (ruleset.obligations ?? [])
    : ruleset.obligations?.length ? ruleset.obligations
      : [{ id: 'CORAL.RULESET.COVERAGE.PARTIAL', message: `Rule coverage for ${profileId} is incomplete` }];
  const unverifiedObligations = [...rulesetObligations, ...independentObligations];
  return { ...report, unverifiedObligations,
    claimStatus: claimStatus(request, report.evaluatedLevel, report.findings,
      unverifiedObligations, report.exceptions),
    ruleset: { id: ruleset.id, profileId: ruleset.profileId, version: ruleset.version,
      ...(ruleset.scope ? { scope: ruleset.scope } : {}) } };
}
