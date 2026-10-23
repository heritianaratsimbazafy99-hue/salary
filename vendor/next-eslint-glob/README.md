# Next ESLint directory glob adapter

This private package replaces only the `fast-glob` dependency of the pinned
`@next/eslint-plugin-next` version. That plugin calls `globSync(pattern,
{ onlyDirectories: true })` in `get-root-dirs` to resolve `settings.next.rootDir`.
It does not use other fast-glob APIs. This is not a general fast-glob replacement.

The adapter uses the maintained `tinyglobby` implementation. It removes the
fast-glob → micromatch → braces dependency chain rather than modifying package
names or suppressing an audit warning. `braces@3.0.3` has no published fix for
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Following the [tinyglobby migration guide](https://superchupu.dev/tinyglobby/migration),
`expandDirectories` is disabled. Terminal `/**` patterns exclude their parent,
and directory results omit the trailing slash, matching the consumed fast-glob
behavior. Unsupported options fail explicitly so a future plugin upgrade cannot
silently change the adapter's contract.

Tinyglobby does not implement zero-padded or stepped brace ranges. The adapter
rejects these explicitly; use alternatives such as `{01,02,03}` or `{1,3,5}`.
This repository does not configure a custom `settings.next.rootDir`.

The root development dependency names this package `fast-glob` through a local
`file:./vendor/next-eslint-glob` reference. The override is scoped to
`@next/eslint-plugin-next@16.4.2` and refers to that root dependency with
`$fast-glob`. A clean `npm ci`, `npm ls --all`, and the installed-dependency
identity assertion in the regression test verify this installation contract.
Recheck the override if the plugin version or dependency layout changes.

`src/test/unit/dependency-glob-regression.test.ts` covers root discovery and an
actual Next ESLint rule over a temporary multi-app fixture. Recheck the plugin's
consumer before updating its version. Remove this adapter when upstream removes
the affected dependency or adopts a patched release.
