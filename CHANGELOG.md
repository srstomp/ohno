# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.16.2] - 2026-02-05

### Added
- `set-handoff` CLI command for subagent reporting
- Test for invalid JSON edge case in `set-handoff --files`

## [0.16.0] - 2026-02-04

### Added
- `task_handoffs` table and MCP tools (`set_task_handoff`, `get_task_handoff`)
- Memory decay for story/epic boundaries (`compact_story_handoffs`, `delete_epic_handoffs`)
- `update-wip` CLI command for hook automation
- `compact-handoffs` and `delete-handoffs` CLI commands
- WIP data included in session context for in-progress tasks
- `fields` parameter for `get_task` (minimal/standard/full)
- `work_in_progress` field on tasks table

## [0.14.3] - 2026-02-03

### Added
- Source parameter documentation for `create_task`

## [0.14.0] - 2026-02-02

### Changed
- Version bump for stable release of field selection feature

### Added
- `get_next_batch` MCP method for batch task retrieval (1-5 tasks)
- `record_task_failure` MCP method for pattern learning
- `needs_rework` flag and `set_needs_rework` MCP tool
- Failure records storage in `task_failures` table

## [0.13.0] - 2026-02-02

### Added
- `get_tasks` now accepts a `fields` parameter: `"minimal"` (default), `"standard"`, or `"full"`
- Minimal fields reduce response size by ~75% for task selection use cases

### Changed
- **BREAKING**: `get_tasks` now returns minimal fields by default
- Callers expecting full fields should pass `fields: "full"`

## [0.12.0] - 2026-01-31

### Fixed
- Handle special regex patterns (`$'`) in task content
- Multiple security vulnerabilities addressed

## [0.11.5] - 2026-01-30

### Added
- `--story` option on task create command
- Source field (`--source` flag) on CLI create command and MCP `create_task` tool

### Fixed
- Preserve kanban board UI state on data updates
- Remove broken progress bar from task detail view

## [0.11.0] - 2026-01-28

### Added
- Story CRUD: `get_story`, `list_stories`, `update_story` MCP tools
- Story management in ohno-core: `getStories`, `updateStory`, formal `Story` interface
- Epic CRUD: `create_epic`, `get_epic`, `get_epics`, `update_epic` MCP tools
- `get_kanban_board` MCP tool for board-style task retrieval
- Epic and story CLI commands: `epics`, `epic get/create/update/delete`, `stories`, `story get/create/update/delete`

## [0.10.0] - 2026-01-26

### Added
- Terminal kanban TUI with `ohno kanban` command
- Watch mode with keyboard navigation (`ohno kanban --watch`)
- Kanban UI enhancements: story filter, group by selector, hierarchical view, epic breadcrumbs
- Story/epic completion badges and type filter in web kanban
- `create_story` MCP tool

## [0.8.4] - 2026-01-24

### Added
- Completion boundary metadata in `update_task_status` response

## [0.8.3] - 2026-01-23

### Added
- Edit and delete functionality on kanban board
- Package READMEs for each package

## [0.8.0] - 2026-01-22

### Added
- GitHub Actions for CI and automated releases

### Fixed
- Watch SQLite WAL file for realtime kanban updates
