# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.13.0] - 2026-02-02

### Added
- `get_tasks` now accepts a `fields` parameter: `"minimal"` (default), `"standard"`, or `"full"`
- Minimal fields reduce response size by ~75% for task selection use cases

### Changed
- **BREAKING**: `get_tasks` now returns minimal fields by default
- Callers expecting full fields should pass `fields: "full"`
