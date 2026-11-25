# Windows x64 release validation

Status: implemented for Coral 0.2.3, updated for Coral 0.2.5, and carried
forward for the Coral 0.2.6 GraphIR 3 candidate.

## Boundary

Windows support means a clean repository can lint, typecheck, build, and test;
published JavaScript packages import and typecheck under the release runtime;
and the Tree-sitter package compiles with the Windows MSVC toolchain. The
reference editor remains a browser application, so browser interactions stay
in the Chromium suite while its production build and unit tests also run on
Windows.

## Environment

The maintained host VM is Windows x64 build 26200 and uses the `runner` account
over SSH. Repository verification uses Node 26.8.2; the minimum-runtime packed
consumer smoke separately uses Node 24.19.0. Both use npm 12.0.2, TypeScript 6.0.3,
Python 3.12.10, Visual Studio 2022 Build Tools 17.14.37516.0 with the x64 C++
workload, and Windows SDK 10.0.26100.0. Node lives under
`C:\coral-toolchains`; Python is installed for the runner. Validation addresses
Node and npm by exact path and places the pinned npm directory first on `PATH`,
then the selected Node directory, for npm lifecycle children. This prevents both
Node's bundled older npm and the Actions runner's bundled Node from being
mistaken for the selected repository or consumer toolchain.

The repository `typecheck` command builds language and render declarations
before checking downstream workspaces. Tree-sitter corpus tests run through a
Node launcher that sets their cache directory with `process.env`, avoiding
POSIX-only inline environment assignment.

## Coral 0.2.5 amendment and artifact flow

The environment and native-build evidence above originated with Coral 0.2.3.
For Coral 0.2.5, the package-consumer flow below changes only the candidate
package/core generation and current release toolchain; archived 0.2.3 evidence
retains its original GraphIR identity.

Linux produces the five platform-neutral npm tarballs from the committed release
worktree. The tarballs are copied to a clean VM staging directory.
`scripts/consumer-smoke.mjs` accepts that directory through
`CORAL_ARTIFACT_DIR`, resolves `@graph-ir/core@0.2.1` from npm for 0.2.5
artifacts, and creates a
fresh consumer for every package. `CORAL_GRAPH_IR_TARBALL` remains available
only for prepublication diagnosis and is not valid release evidence.

Each consumer installs from the packed artifacts, runs a real API call, and
compiles a public-surface TypeScript program. The native consumer additionally
permits the registry Tree-sitter lifecycle and invokes npm's reviewed
`node-gyp` directly for the local Coral tarball, then loads the compiled addon
and parses `service "Consumer"`.

For Coral 0.2.6 the same package flow resolves exact published
`@graph-ir/core@0.2.2` and validates GraphIR 3.0.0. Slice 20 pins and verifies
that dependency identity. Slice 100 repeats the packed six-package and
minimum-runtime consumer flow after the atomic Coral 0.2.6 version bump; no
local GraphIR checkout or cross-repository workflow access is release evidence.

npm 12.0.2 records a Windows local tarball as `file:C:\...` but normalizes every
parseable `allowScripts` file key to either `file:C:/...` or `C:\...`. Its
exact-match policy therefore cannot approve that local artifact. Direct
`node-gyp` invocation is limited to this prepublication tarball test and still
compiles the exact packed sources. Once published, a consumer can approve the
trusted registry package by the normal `tree-sitter-coral` name; the repository
root uses that form for its workspace policy.

## Continuous verification

The native matrix covers `win32-x64` and pins Python 3.12.10 there. A dedicated
Windows job runs clean install, the full repository verification, and the
consumer smoke against the public GraphIR dependency. The on-host VM supplies
matching native Windows evidence before publication.

## Portable verification and editor behavior

The Windows repository gate remains the complete `npm run verify`; passing
packed-consumer smoke does not replace it. Hosted Windows and the maintained
Windows 11 VM are distinct environments and their evidence is recorded separately.

Read-failure tests inject an erroring stream into the real HTTP pipeline rather
than relying on POSIX permission bits. Windows junction fixtures retain symlink
rejection coverage without requiring permission to create file symlinks. Path
containment uses relative paths and absolute-path detection, including drive and
UNC escapes; protected source roots and parent traversal respect Windows casing.
Recursive documentation paths are normalized before audience exclusions.

Release fixtures use the host PATH delimiter and explicit Git Bash. Direct npm
launches use the active npm JavaScript CLI through Node on Windows, preserving
literal arguments without a shell; standalone launches follow the npm shim on
PATH before falling back to bundled npm beside Node. Registry MCP and controlled
defect Playwright direct launches likewise execute their JavaScript entrypoints,
and scratch output uses the host temporary directory. Dynamic ESM imports use
file URLs rather than Windows drive paths.

The editor leaves AltGr and input-method composition untouched, accepts Ctrl+Y
for diagram redo, and preserves native text undo/redo. Saved and exported document
names prefix Windows device stems such as CON and LPT1 with `diagram-`; document
metadata and source are unchanged. These safeguards do not widen browser support.
