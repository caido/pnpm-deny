# Default advisory provider uses pnpm audit

The default advisories provider invokes `pnpm audit` and preserves its payload and routing behavior, including sending the full dependency request to the configured default registry. This matches what users already run in CI and inherits pnpm’s auth/proxy/TLS configuration. The trade-off is intentional: mixed public/private workspaces may disclose private package names to the default registry. An extensible provider interface remains so alternate backends can be composed programmatically without changing the CLI’s default.
