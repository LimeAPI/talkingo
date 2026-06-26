/**
 * Test stub for the `server-only` marker package.
 *
 * `server-only` is a build-time guard (provided by Next.js) that throws if a
 * module is pulled into a client bundle. It has no runtime behavior and is not
 * installed as a standalone dependency, so under Vitest we alias it to this
 * empty module (see `vitest.config.ts`) to let server modules import cleanly.
 */
export {}
