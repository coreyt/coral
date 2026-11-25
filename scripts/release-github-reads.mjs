// Every GitHub REST read that release.yml's verify job makes after package
// publication (CRO100-3, CRO100-4), used by `github-release-guard.mjs`.
const API = 'https://api.github.com';
const REPO_API = '/repos/coreyt/coral';

export function githubClient(token, fetchImpl = fetch) {
  return async (path, { allow404 = false } = {}) => {
    const response = await fetchImpl(`${API}${path}`, {
      headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub readback failed for ${path}: HTTP ${response.status}`);
    return response.json();
  };
}

// The tag, release, Pages source run and artifact, and the github-pages
// deployments at `commit` with every deployment's statuses.
export async function readReleaseResponses(github, { version, commit, pagesRunId }) {
  const [tagRef, release, initialPagesRun, pagesArtifacts, deployments] = await Promise.all([
    github(`${REPO_API}/git/ref/tags/v${version}`, { allow404: true }),
    github(`${REPO_API}/releases/tags/v${version}`, { allow404: true }),
    github(`${REPO_API}/actions/runs/${pagesRunId}`),
    github(`${REPO_API}/actions/runs/${pagesRunId}/artifacts?per_page=100`),
    github(`${REPO_API}/deployments?sha=${commit}&environment=github-pages&per_page=100`),
  ]);
  const pagesAttempt = initialPagesRun.run_attempt;
  const named = (pagesArtifacts?.artifacts ?? []).filter(item => item.name === 'github-pages');
  if (named.length !== 1) throw new Error('Pages run must retain exactly one github-pages artifact');
  const [pagesRun, pagesJobs, pagesArtifact, annotatedTag, statuses] = await Promise.all([
    github(`${REPO_API}/actions/runs/${pagesRunId}/attempts/${pagesAttempt}`),
    github(`${REPO_API}/actions/runs/${pagesRunId}/attempts/${pagesAttempt}/jobs?per_page=100`),
    github(`${REPO_API}/actions/artifacts/${named[0].id}`),
    tagRef?.object?.type === 'tag' ? github(`${REPO_API}/git/tags/${tagRef.object.sha}`) : null,
    Promise.all((Array.isArray(deployments) ? deployments : []).map(async deployment => [
      deployment.id, await github(`${REPO_API}/deployments/${deployment.id}/statuses?per_page=100`),
    ])),
  ]);
  return {
    tagRef, annotatedTag, release, pagesRun, pagesJobs, pagesArtifacts, pagesArtifact,
    deployments, deploymentStatuses: Object.fromEntries(statuses),
  };
}
