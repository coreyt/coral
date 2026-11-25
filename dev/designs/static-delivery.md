# Static delivery and artifact design

Status: historical 0.2.5 design, superseded by the
0.2.6 online-delivery design.

## Boundary and invariants

The repository delivery layer converts one guarded source identity into one
frozen static directory. The editor, docs, Pages artifact, and downloadable ZIP
are not independent builds. Published packages, GraphIR, the Coral document
schema, editor state, and service-worker update consent remain unchanged.

```text
exact source identity
  -> isolated app build + isolated docs build
  -> clean assembled payload (app, docs, version, licenses)
  -> existing Workbox finalizer
  -> integrity.json and frozen-site verification
  -> Pages artifact + deterministic ZIP + external SHA256SUMS
```

Every transition reads a complete prior state and writes a newly clean next
state. No payload byte changes after `integrity.json`. Wrapper metadata never
enters the payload manifest.

## Build and route ownership

One root orchestration command validates `{product: "coral", version, commit}`
against the root manifest, builds the editor with `/coral/`, builds VitePress
with `/coral/docs/`, and assembles into a newly absent ignored repository
`build/` tree. Source/package directories and unresolved, pre-existing,
symlinked, special, or escaping destinations are rejected.

The committed VitePress configuration and index are deliberately minimal.
They establish the base and a current-documentation door but make no feature or
navigation claims. Slice 50 replaces the index and expands the configuration.

The service worker is generated after assembly. Its navigation table contains
the two editor URLs plus exact aliases derived from precached documentation
HTML: `docs/index.html` maps `/coral/docs/`, and `docs/x.html` maps only its
exact `.html` and extensionless forms. Directory indexes also map their exact
trailing-slash form. Unknown documentation paths, arbitrary paths, 404s, and
non-navigation assets have no fallback.

## Identity, integrity, and privacy

`version.json` is canonical newline-terminated JSON containing the exact shared
identity and no time, ref, environment, or host value. The browser constant,
worker, version file, integrity file, workflow inputs, and artifact name must
agree on version and full lowercase commit.

`integrity.json` is canonical newline-terminated JSON:

```ts
interface SiteIntegrityV1 {
  schemaVersion: 1;
  identity: { product: 'coral'; version: string; commit: string };
  files: Array<{ path: string; bytes: number; sha256: string }>;
}
```

Entries are unique sorted POSIX relative paths for every regular payload file
except `integrity.json`. SHA-256 is lowercase over exact bytes. Verification
re-enumerates the directory and rejects additions, removals, mutation,
symlinks, special files, invalid paths, identity disagreement, source maps,
test/report trees, environment files, credential-shaped filenames, and known
secret markers without echoing secret values.

The frozen payload includes the root license and the render font provenance and
OFL notices because the browser bundle redistributes those embedded faces.

## Deterministic ZIP and checksum

The artifact writer accepts only a verified frozen site. It emits uncompressed
ZIP entries beneath one `coral/` directory, lexically sorted, with fixed DOS
time/date, UTF-8 names, no data descriptors, fixed regular-file permissions,
and no symlink or extra-field input. A small local ZIP reader verifies this
closed format, CRC-32, paths, ordering, metadata, and central-directory/local-
header agreement; general archive support is intentionally out of scope.

The ZIP contains every frozen file including `integrity.json`, and nothing
else. Extraction re-verifies the site. `SHA256SUMS` is atomically written after
the final ZIP bytes are closed and contains one lowercase SHA-256 plus the exact
archive basename. A failed ZIP or verification leaves no checksum.

## Workflow trust, deployment, and rollback

Push and pull-request CI have `contents: read` only. They build twice to prove
static-candidate reproducibility but cannot upload to Pages or deploy. The
Pages workflow is
manual/reusable, accepts an exact version and full commit, checks out that
commit, runs the existing release guard, builds once, verifies the frozen site
and artifact, and retains identity-qualified evidence.

Only the deploy job receives `pages: write` and `id-token: write`; it consumes
the verified Pages artifact, uses the `github-pages` environment, and is
serialized across every commit by one global concurrency group. Both the
general static evidence and deployable Pages artifact are retained for 90
days. A separate read-only registry job rebuilds package artifacts from the
same checkout and runs the existing public-registry verifier; deployment needs
both that proof and the static build. Its private-repository equivalence path
binds to the defining job's Pages-workflow identity, including when reused by
a caller. Slice 80 invokes this only after npm
publication. A failed build, guard, upload, or registry proof never reaches
deployment and leaves the last-known-good site untouched.

Rollback is an artifact operation, not a source rebuild. A retained known-good
workflow run can have its deployment job rerun against the already uploaded
Pages artifact. The existing application lifecycle presents the older exact
identity as a downgrade and retains caches until safe consent and successful
boot. Slice 80 supplies the first live deploy/rollback evidence and may use the
verified GitHub release ZIP if workflow retention is unavailable.

## Failure and cleanup

All generated directories begin clean, all temporary files are renamed only
after verification, and failures remove partial current outputs without
touching a prior frozen artifact or hosted deployment. Tests use temporary
directories and ephemeral servers. Slice closure removes repository build,
ZIP, checksum, extraction, preview, and server artifacts.
