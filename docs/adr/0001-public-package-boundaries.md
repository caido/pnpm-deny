# Public package boundaries

pnpm-deny is published as six packages: the `pnpm-deny` CLI, `@pnpm-deny/core`, and four independently composable Policy Check packages (`advisories`, `bans`, `licenses`, `sources`). The CLI depends on core and all four checks. Each check package depends only on core. Third-party check loading from configuration is out of scope; the public APIs exist for programmatic composition.
