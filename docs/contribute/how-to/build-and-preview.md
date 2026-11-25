# How to build and preview Coral documentation

Preview contributor pages locally, build the documentation site, and verify
the combined online-hosted product from the repository root.

1. Start the documentation development server.

   ```sh
   npm run docs:dev
   ```

   VitePress prints a local URL when it is ready.

2. Open the reported URL and navigate to `/contribute/`.

   The Contribute to Coral index appears with working local navigation.

3. Stop the development server with `Ctrl+C`.

   The shell prompt returns and no preview process remains running.

4. Build the documentation site.

   ```sh
   npm run docs:build
   ```

   The command rebuilds public package declarations, generates the library
   reference, then writes `docs/.vitepress/dist/contribute/index.html` and
   `docs/.vitepress/dist/api/index.html`. The generated reference is available
   at `/coral/docs/api/` in the assembled site. For reference in development
   preview, run `npm run docs:api` before `npm run docs:dev`.

5. From a clean checkout with no existing `build/` directory, assemble the
   application and documentation as one release-shaped product.

   The 0.2.9 checkout pins published `@graph-ir/core@0.2.4` exactly. Coral
   package publication remains a separate release step, and GraphIR
   specification publication is deferred.
   See the [current architecture](../reference/architecture.md).

   ```sh
   npm run build:online
   ```

   The command creates the application at `/coral/`, documentation at
   `/coral/docs/` and the shared example gallery at `/coral/examples/` under
   `build/site/`. It does not create an application ZIP,
   checksum download, or manifest. Its only `sw.js` is the unregistered 0.2.6
   sunset worker that retires 0.2.5 offline registrations.

6. Verify the frozen output.

   ```sh
   npm run verify:online
   ```

   The integrity manifest, hosted tree, routes, absence boundaries, and
   release identity all verify without rebuilding the product.

## Result

The contributor route works in interactive preview and a documentation build.
The procedure checks the combined hosted shape locally. It does not prove
registry adoption, candidate CI, installed-package identity, platform support,
or hosted deployment. Slice 100 retains those identity-sensitive release checks.

## Related

- [Testing](../reference/testing.md)
- [Generated assets and dependencies](../reference/generated-assets-and-dependencies.md)
