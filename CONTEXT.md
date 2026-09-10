# pnpm-deny

A dependency policy linter for pnpm workspaces. It evaluates a resolved dependency graph against configured advisories, bans, licenses, and sources rules.

## Language

**Package**:
An npm package identified by a canonical name, version, and source.
_Avoid_: Crate, module, library, dependency (when referring to the artifact itself)

**Workspace Package**:
A Package that is a member of the pnpm workspace under inspection.
_Avoid_: Importer (except when discussing lockfile structure), local package, monorepo package

**External Package**:
A Package that is not a Workspace Package, reached through the dependency graph.
_Avoid_: Third-party package, transitive package (transitive is a reachability property, not a package kind)

**Artifact Identity**:
The stable identity of a Package: canonical name, version, and source. Peer-context suffixes are not part of Artifact Identity.
_Avoid_: Package ID, lockfile key, depPath

**Resolved Instance**:
A concrete occurrence of a Package in the lockfile, including peer-context and patch suffixes when present.
_Avoid_: Snapshot, installation, node

**Dependency Edge**:
A directed relationship from a parent Package (or Workspace Package) to a child Resolved Instance, including the declared alias and dependency field.
_Avoid_: Dependency (when referring to the edge), import, require

**Policy Check**:
One of the independent evaluation families: advisories, bans, licenses, or sources.
_Avoid_: Rule, linter, validator, audit (audit is specifically the vulnerability provider)

**Finding**:
A diagnostic produced by a Policy Check against the graph, carrying a lint level and diagnostic code.
_Avoid_: Error, violation, warning (those are lint levels or severity, not the artifact)

**Source**:
The origin from which a Package was obtained: registry, git, file, link, URL tarball, or custom resolver.
_Avoid_: Registry (registry is one kind of Source), origin, provenance

**Lint Level**:
The severity assigned to a Finding: allow, warn, or deny.
_Avoid_: Severity, priority

**Private Package**:
A Workspace Package whose `package.json` declares `"private": true`.
_Avoid_: Unpublished package (unpublished is a registry-status Finding for External Packages)
