"""HTML template for the Ohno kanban board."""
KANBAN_HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ohno - Kanban Board</title>
    <script>window.KANBAN_DATA = {};</script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #334155;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --border: #475569;
            --blue: #3b82f6;
            --green: #22c55e;
            --yellow: #eab308;
            --red: #ef4444;
            --purple: #a855f7;
            --orange: #f97316;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
        }

        .header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 1rem 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header h1 { font-size: 1.25rem; font-weight: 600; }

        .sync-status {
            font-size: 0.75rem;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .sync-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--green);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .stats {
            display: flex;
            gap: 1.5rem;
            font-size: 0.875rem;
        }

        .stat-value { font-weight: 600; }
        .stat-label { color: var(--text-secondary); margin-left: 0.25rem; }

        .progress-bar-container {
            background: var(--bg-secondary);
            padding: 0.5rem 1.5rem;
            border-bottom: 1px solid var(--border);
        }

        .progress-bar {
            height: 6px;
            background: var(--bg-card);
            border-radius: 3px;
            overflow: hidden;
            display: flex;
        }

        .progress-done { background: var(--green); }
        .progress-review { background: var(--purple); }
        .progress-in-progress { background: var(--blue); }
        .progress-blocked { background: var(--red); }

        .filters {
            background: var(--bg-secondary);
            padding: 0.5rem 1.5rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .filter-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .filter-label {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .filter-select {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
        }

        .board {
            display: flex;
            gap: 1rem;
            padding: 1rem 1.5rem;
            overflow-x: auto;
            min-height: calc(100vh - 140px);
        }

        .column {
            min-width: 280px;
            max-width: 280px;
            background: var(--bg-secondary);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            max-height: calc(100vh - 160px);
        }

        .column-header {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .column-todo .column-header { border-left: 3px solid var(--text-muted); }
        .column-in_progress .column-header { border-left: 3px solid var(--blue); }
        .column-review .column-header { border-left: 3px solid var(--purple); }
        .column-done .column-header { border-left: 3px solid var(--green); }
        .column-blocked .column-header { border-left: 3px solid var(--red); }

        .column-title { font-weight: 600; font-size: 0.875rem; }

        .column-count {
            background: var(--bg-card);
            padding: 0.125rem 0.5rem;
            border-radius: 10px;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }

        .column-cards {
            padding: 0.5rem;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .card {
            background: var(--bg-card);
            border-radius: 6px;
            padding: 0.75rem;
            cursor: default;
            transition: transform 0.1s, box-shadow 0.1s;
        }

        .card:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.375rem;
        }

        .card-id {
            font-size: 0.7rem;
            color: var(--text-muted);
            font-family: monospace;
        }

        .card-priority {
            font-size: 0.6rem;
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
            font-weight: 600;
        }

        .priority-P0 { background: var(--red); color: white; }
        .priority-P1 { background: var(--orange); color: white; }
        .priority-P2 { background: var(--yellow); color: black; }
        .priority-P3 { background: var(--text-muted); color: white; }

        .card-title {
            font-size: 0.8rem;
            font-weight: 500;
            line-height: 1.3;
            margin-bottom: 0.375rem;
        }

        .card-meta {
            display: flex;
            justify-content: space-between;
            font-size: 0.7rem;
            color: var(--text-muted);
        }

        .card-type {
            background: var(--bg-secondary);
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
        }

        .card-epic {
            font-size: 0.65rem;
            color: var(--blue);
            margin-top: 0.375rem;
            padding-top: 0.375rem;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }

        .audit-badge {
            font-size: 0.6rem;
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
            font-weight: 600;
        }

        .audit-0 { background: #6b7280; color: white; }
        .audit-1 { background: #ef4444; color: white; }
        .audit-2 { background: #f97316; color: white; }
        .audit-3 { background: #eab308; color: black; }
        .audit-4 { background: #22c55e; color: white; }
        .audit-5 { background: #3b82f6; color: white; }

        .empty { text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.8rem; }

        .no-data {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: calc(100vh - 80px);
            color: var(--text-secondary);
            text-align: center;
            padding: 2rem;
        }

        .no-data code {
            background: var(--bg-card);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.875rem;
        }

        /* Detail Panel Slide-out */
        .detail-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s, visibility 0.2s;
            z-index: 200;
        }

        .detail-backdrop.open {
            opacity: 1;
            visibility: visible;
        }

        .detail-panel {
            position: fixed;
            top: 0;
            right: -600px;
            width: 600px;
            max-width: 100vw;
            height: 100vh;
            background: var(--bg-secondary);
            border-left: 1px solid var(--border);
            overflow-y: auto;
            transition: right 0.3s ease-out;
            z-index: 201;
        }

        .detail-panel.open {
            right: 0;
        }

        .detail-header {
            padding: 1.25rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            position: sticky;
            top: 0;
            background: var(--bg-secondary);
            z-index: 1;
        }

        .detail-header-left {
            flex: 1;
            min-width: 0;
        }

        .detail-id {
            font-size: 0.75rem;
            color: var(--text-muted);
            font-family: monospace;
            margin-bottom: 0.5rem;
        }

        .detail-title {
            font-size: 1.125rem;
            font-weight: 600;
            line-height: 1.3;
            margin-bottom: 0.75rem;
        }

        .detail-badges {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .detail-badge {
            font-size: 0.7rem;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-weight: 500;
        }

        .detail-close {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
            margin-left: 1rem;
        }

        .detail-close:hover {
            background: var(--bg-primary);
            color: var(--text-primary);
        }

        .detail-section {
            padding: 1rem 1.25rem;
            border-bottom: 1px solid var(--border);
        }

        .detail-section:last-child {
            border-bottom: none;
        }

        .detail-section-title {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.75rem;
            font-weight: 600;
        }

        .detail-description {
            font-size: 0.875rem;
            line-height: 1.6;
            color: var(--text-primary);
            white-space: pre-wrap;
        }

        .detail-context {
            font-size: 0.8rem;
            line-height: 1.5;
            color: var(--text-secondary);
            background: var(--bg-card);
            padding: 0.75rem;
            border-radius: 6px;
            white-space: pre-wrap;
        }

        .detail-files {
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
        }

        .detail-file {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            background: var(--bg-card);
            border-radius: 4px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.1s;
        }

        .detail-file:hover {
            background: var(--bg-primary);
        }

        .detail-file-icon {
            color: var(--text-muted);
        }

        .detail-file-path {
            font-family: monospace;
            color: var(--blue);
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .detail-file-copy {
            color: var(--text-muted);
            font-size: 0.7rem;
            opacity: 0;
            transition: opacity 0.1s;
        }

        .detail-file:hover .detail-file-copy {
            opacity: 1;
        }

        .detail-deps {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .detail-dep {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            background: var(--bg-card);
            border-radius: 4px;
            font-size: 0.8rem;
        }

        .detail-dep-type {
            color: var(--text-muted);
            font-size: 0.7rem;
            text-transform: uppercase;
        }

        .detail-dep-id {
            font-family: monospace;
            color: var(--purple);
            cursor: pointer;
        }

        .detail-dep-id:hover {
            text-decoration: underline;
        }

        .detail-dep-status {
            font-size: 0.65rem;
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
            margin-left: auto;
        }

        .detail-dep-status.done { background: var(--green); color: white; }
        .detail-dep-status.blocked { background: var(--red); color: white; }
        .detail-dep-status.in_progress { background: var(--blue); color: white; }

        .detail-activity {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .activity-item {
            display: flex;
            gap: 0.75rem;
            font-size: 0.8rem;
        }

        .activity-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--bg-card);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 0.7rem;
        }

        .activity-icon.status { background: var(--blue); color: white; }
        .activity-icon.note { background: var(--purple); color: white; }
        .activity-icon.file { background: var(--green); color: white; }

        .activity-content {
            flex: 1;
            min-width: 0;
        }

        .activity-text {
            color: var(--text-primary);
            margin-bottom: 0.25rem;
        }

        .activity-time {
            font-size: 0.7rem;
            color: var(--text-muted);
        }

        .activity-actor {
            color: var(--blue);
            font-weight: 500;
        }

        .detail-meta {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
        }

        .meta-item {
            background: var(--bg-card);
            padding: 0.625rem;
            border-radius: 4px;
        }

        .meta-label {
            font-size: 0.65rem;
            color: var(--text-muted);
            text-transform: uppercase;
            margin-bottom: 0.25rem;
        }

        .meta-value {
            font-size: 0.875rem;
            color: var(--text-primary);
        }

        .detail-blockers {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid var(--red);
            padding: 0.75rem;
            border-radius: 6px;
            color: var(--red);
            font-size: 0.875rem;
            line-height: 1.5;
            white-space: pre-wrap;
        }

        .detail-handoff {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid var(--blue);
            padding: 0.75rem;
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.875rem;
            line-height: 1.5;
            white-space: pre-wrap;
        }

        .detail-progress {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .detail-progress-bar {
            flex: 1;
            height: 8px;
            background: var(--bg-card);
            border-radius: 4px;
            overflow: hidden;
        }

        .detail-progress-fill {
            height: 100%;
            background: var(--green);
            border-radius: 4px;
            transition: width 0.3s;
        }

        .detail-progress-text {
            font-size: 0.875rem;
            font-weight: 600;
            min-width: 40px;
            text-align: right;
        }

        .empty-state {
            text-align: center;
            padding: 1rem;
            color: var(--text-muted);
            font-size: 0.8rem;
            font-style: italic;
        }

        /* Card clickable */
        .card.clickable {
            cursor: pointer;
        }

        .card.clickable:active {
            transform: scale(0.98);
        }

        /* Toast notification for copy */
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--bg-card);
            border: 1px solid var(--border);
            padding: 0.75rem 1.25rem;
            border-radius: 6px;
            font-size: 0.875rem;
            color: var(--text-primary);
            opacity: 0;
            transition: transform 0.3s, opacity 0.3s;
            z-index: 300;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    </style>
</head>
<body>
    <div id="app"><div class="no-data">Loading...</div></div>
    <div class="detail-backdrop" id="detailBackdrop" onclick="closeDetail()"></div>
    <div class="detail-panel" id="detailPanel"></div>
    <div class="toast" id="toast"></div>
    <script>
        // Kanban board rendering script
        // Data is sanitized server-side before embedding, and the esc() function
        // provides additional client-side escaping for any dynamic content.

        const REFRESH_INTERVAL = 3000;
        const COLUMNS = [
            { id: 'todo', title: 'To Do', status: 'todo' },
            { id: 'in_progress', title: 'In Progress', status: 'in_progress' },
            { id: 'review', title: 'Review', status: 'review' },
            { id: 'done', title: 'Done', status: 'done' },
            { id: 'blocked', title: 'Blocked', status: 'blocked' },
        ];

        let data = window.KANBAN_DATA || {};
        let lastSync = data.synced_at;
        let filters = { epic: '', priority: '', type: '' };

        function init() {
            if (data.tasks && data.tasks.length) render();
            else renderNoData();
            setInterval(checkUpdates, REFRESH_INTERVAL);
        }

        async function checkUpdates() {
            try {
                const r = await fetch('kanban.html?_=' + Date.now());
                const t = await r.text();
                const m = t.match(/"synced_at":\\s*"([^"]+)"/);
                if (m && m[1] !== lastSync) location.reload();
            } catch(e) { /* ignore fetch errors */ }
        }

        function render() {
            const s = data.stats || {};
            const total = s.total_tasks || 1;
            const app = document.getElementById('app');

            // Build HTML with escaped content
            let html = '<header class="header">';
            html += '<div style="display:flex;align-items:center;gap:1rem">';
            html += '<h1>' + esc(data.projects && data.projects[0] ? data.projects[0].name : 'Ohno') + '</h1>';
            html += '<div class="sync-status">';
            html += '<span class="sync-dot"></span>';
            html += '<span>' + new Date(data.synced_at).toLocaleTimeString() + '</span>';
            html += '</div></div>';
            html += '<div class="stats">';
            html += '<div><span class="stat-value">' + s.done_tasks + '/' + s.total_tasks + '</span><span class="stat-label">tasks</span></div>';
            html += '<div><span class="stat-value">' + s.completion_pct + '%</span><span class="stat-label">done</span></div>';
            html += '<div><span class="stat-value">' + s.in_progress_tasks + '</span><span class="stat-label">active</span></div>';
            html += '<div><span class="stat-value">' + s.blocked_tasks + '</span><span class="stat-label">blocked</span></div>';
            html += '</div></header>';

            html += '<div class="progress-bar-container"><div class="progress-bar">';
            html += '<div class="progress-done" style="width:' + (s.done_tasks/total*100) + '%"></div>';
            html += '<div class="progress-review" style="width:' + (s.review_tasks/total*100) + '%"></div>';
            html += '<div class="progress-in-progress" style="width:' + (s.in_progress_tasks/total*100) + '%"></div>';
            html += '<div class="progress-blocked" style="width:' + (s.blocked_tasks/total*100) + '%"></div>';
            html += '</div></div>';

            html += '<div class="filters">';
            html += '<div class="filter-group"><span class="filter-label">Epic</span>';
            html += '<select class="filter-select" onchange="setFilter(\\'epic\\',this.value)">';
            html += '<option value="">All</option>';
            (data.epics||[]).forEach(function(e) {
                html += '<option value="' + esc(e.id) + '">' + esc(e.title) + '</option>';
            });
            html += '</select></div>';
            html += '<div class="filter-group"><span class="filter-label">Priority</span>';
            html += '<select class="filter-select" onchange="setFilter(\\'priority\\',this.value)">';
            html += '<option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option>';
            html += '</select></div>';
            html += '<div class="filter-group"><span class="filter-label">Type</span>';
            html += '<select class="filter-select" onchange="setFilter(\\'type\\',this.value)">';
            html += '<option value="">All</option>';
            var types = {};
            (data.tasks||[]).forEach(function(t) { if (t.task_type) types[t.task_type] = true; });
            Object.keys(types).forEach(function(t) {
                html += '<option value="' + esc(t) + '">' + esc(t) + '</option>';
            });
            html += '</select></div></div>';

            html += '<div class="board">';
            COLUMNS.forEach(function(col) {
                html += renderColumn(col);
            });
            html += '</div>';

            app.innerHTML = html;
        }

        function renderColumn(col) {
            var tasks = getFilteredTasks().filter(function(t) { return t.status === col.status; });
            var html = '<div class="column column-' + col.id + '">';
            html += '<div class="column-header">';
            html += '<span class="column-title">' + esc(col.title) + '</span>';
            html += '<span class="column-count">' + tasks.length + '</span>';
            html += '</div><div class="column-cards">';
            if (tasks.length) {
                tasks.forEach(function(task) {
                    html += renderCard(task);
                });
            } else {
                html += '<div class="empty">No tasks</div>';
            }
            html += '</div></div>';
            return html;
        }

        function renderCard(task) {
            var story = (data.stories||[]).find(function(s) { return s.id === task.story_id; }) || {};
            var epic = (data.epics||[]).find(function(e) { return e.id === story.epic_id; }) || {};
            var hasDetails = task.description || task.context_summary || task.blockers || task.handoff_notes;
            var html = '<div class="card clickable" onclick="openDetail(\\'' + esc(task.id) + '\\')">';
            html += '<div class="card-header">';
            html += '<span class="card-id">' + esc(task.id) + '</span>';
            if (epic.priority) {
                html += '<span class="card-priority priority-' + esc(epic.priority) + '">' + esc(epic.priority) + '</span>';
            }
            html += '</div>';
            html += '<div class="card-title">' + esc(task.title) + '</div>';
            html += '<div class="card-meta">';
            if (task.task_type) {
                html += '<span class="card-type">' + esc(task.task_type) + '</span>';
            } else {
                html += '<span></span>';
            }
            var metaRight = '';
            if (task.progress_percent != null && task.progress_percent > 0) {
                metaRight += '<span style="color:var(--green)">' + task.progress_percent + '%</span> ';
            }
            if (task.estimate_hours) {
                metaRight += '<span>' + task.estimate_hours + 'h</span>';
            }
            html += metaRight || '<span></span>';
            html += '</div>';
            if (epic.title) {
                html += '<div class="card-epic">' + esc(epic.title);
                if (epic.audit_level != null) {
                    html += '<span class="audit-badge audit-' + epic.audit_level + '">L' + epic.audit_level + '</span>';
                }
                html += '</div>';
            }
            html += '</div>';
            return html;
        }

        function getFilteredTasks() {
            var tasks = data.tasks || [];
            var storyEpic = {};
            (data.stories||[]).forEach(function(s) { storyEpic[s.id] = s.epic_id; });
            var epicPri = {};
            (data.epics||[]).forEach(function(e) { epicPri[e.id] = e.priority; });

            if (filters.epic) {
                var storyIds = {};
                (data.stories||[]).forEach(function(s) {
                    if (s.epic_id === filters.epic) storyIds[s.id] = true;
                });
                tasks = tasks.filter(function(t) { return storyIds[t.story_id]; });
            }
            if (filters.priority) {
                tasks = tasks.filter(function(t) {
                    return epicPri[storyEpic[t.story_id]] === filters.priority;
                });
            }
            if (filters.type) {
                tasks = tasks.filter(function(t) { return t.task_type === filters.type; });
            }
            return tasks;
        }

        function setFilter(key, val) {
            filters[key] = val;
            render();
        }

        // Escape HTML special characters to prevent XSS
        function esc(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function renderNoData() {
            var app = document.getElementById('app');
            app.innerHTML = '<header class="header"><h1>Ohno - Kanban Board</h1></header>' +
                '<div class="no-data">' +
                '<h2 style="margin-bottom:1rem">No Data</h2>' +
                '<p>Run <code>prd-analyzer</code> to create tasks<br>or ensure <code>.ohno/tasks.db</code> exists</p>' +
                '<p style="margin-top:1rem;font-size:0.8rem;color:var(--text-muted)">Auto-refreshing...</p>' +
                '</div>';
        }

        // Detail panel functions
        var currentTaskId = null;

        function openDetail(taskId) {
            currentTaskId = taskId;
            var task = (data.tasks||[]).find(function(t) { return t.id === taskId; });
            if (!task) return;

            var panel = document.getElementById('detailPanel');
            var backdrop = document.getElementById('detailBackdrop');

            renderDetailPanel(task, panel);
            panel.classList.add('open');
            backdrop.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeDetail() {
            var panel = document.getElementById('detailPanel');
            var backdrop = document.getElementById('detailBackdrop');
            panel.classList.remove('open');
            backdrop.classList.remove('open');
            document.body.style.overflow = '';
            currentTaskId = null;
        }

        function renderDetailPanel(task, panel) {
            var story = (data.stories||[]).find(function(s) { return s.id === task.story_id; }) || {};
            var epic = (data.epics||[]).find(function(e) { return e.id === story.epic_id; }) || {};
            var taskFiles = (data.task_files||[]).filter(function(f) { return f.task_id === task.id; });
            var taskDeps = (data.task_dependencies||[]).filter(function(d) { return d.task_id === task.id; });
            var taskActivity = (data.task_activity||[]).filter(function(a) { return a.task_id === task.id; })
                .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 20);

            var html = '<div class="detail-header">';
            html += '<div class="detail-header-left">';
            html += '<div class="detail-id">' + esc(task.id) + '</div>';
            html += '<div class="detail-title">' + esc(task.title) + '</div>';
            html += '<div class="detail-badges">';
            if (task.status) {
                var statusColors = {todo:'var(--text-muted)',in_progress:'var(--blue)',review:'var(--purple)',done:'var(--green)',blocked:'var(--red)'};
                html += '<span class="detail-badge" style="background:' + (statusColors[task.status]||'var(--text-muted)') + ';color:white">' + esc(task.status.replace('_',' ')) + '</span>';
            }
            if (epic.priority) {
                var priColors = {P0:'var(--red)',P1:'var(--orange)',P2:'var(--yellow)',P3:'var(--text-muted)'};
                var priText = epic.priority === 'P2' ? 'black' : 'white';
                html += '<span class="detail-badge" style="background:' + (priColors[epic.priority]||'var(--text-muted)') + ';color:' + priText + '">' + esc(epic.priority) + '</span>';
            }
            if (task.task_type) {
                html += '<span class="detail-badge" style="background:var(--bg-card)">' + esc(task.task_type) + '</span>';
            }
            html += '</div></div>';
            html += '<button class="detail-close" onclick="closeDetail()">&times;</button>';
            html += '</div>';

            // Progress section
            if (task.progress_percent != null) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Progress</div>';
                html += '<div class="detail-progress">';
                html += '<div class="detail-progress-bar"><div class="detail-progress-fill" style="width:' + (task.progress_percent || 0) + '%"></div></div>';
                html += '<span class="detail-progress-text">' + (task.progress_percent || 0) + '%</span>';
                html += '</div></div>';
            }

            // Blockers section (if blocked)
            if (task.blockers) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Blockers</div>';
                html += '<div class="detail-blockers">' + esc(task.blockers) + '</div>';
                html += '</div>';
            }

            // Description section
            if (task.description) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Description</div>';
                html += '<div class="detail-description">' + esc(task.description) + '</div>';
                html += '</div>';
            }

            // Context section
            if (task.context_summary) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Context</div>';
                html += '<div class="detail-context">' + esc(task.context_summary) + '</div>';
                html += '</div>';
            }

            // Handoff notes
            if (task.handoff_notes) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Handoff Notes</div>';
                html += '<div class="detail-handoff">' + esc(task.handoff_notes) + '</div>';
                html += '</div>';
            }

            // Working files from task field
            if (task.working_files) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Working Files</div>';
                html += '<div class="detail-files">';
                var files = task.working_files.split(',').map(function(f) { return f.trim(); }).filter(Boolean);
                files.forEach(function(f) {
                    html += '<div class="detail-file" onclick="copyToClipboard(\\'' + esc(f) + '\\')">';
                    html += '<span class="detail-file-icon">📄</span>';
                    html += '<span class="detail-file-path">' + esc(f) + '</span>';
                    html += '<span class="detail-file-copy">Copy</span>';
                    html += '</div>';
                });
                html += '</div></div>';
            }

            // Files from task_files table
            if (taskFiles.length > 0) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Associated Files</div>';
                html += '<div class="detail-files">';
                taskFiles.forEach(function(f) {
                    html += '<div class="detail-file" onclick="copyToClipboard(\\'' + esc(f.file_path) + '\\')">';
                    html += '<span class="detail-file-icon">' + (f.file_type === 'modified' ? '✏️' : f.file_type === 'created' ? '➕' : '📄') + '</span>';
                    html += '<span class="detail-file-path">' + esc(f.file_path) + '</span>';
                    html += '<span class="detail-file-copy">Copy</span>';
                    html += '</div>';
                });
                html += '</div></div>';
            }

            // Dependencies
            if (taskDeps.length > 0) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Dependencies</div>';
                html += '<div class="detail-deps">';
                taskDeps.forEach(function(d) {
                    var depTask = (data.tasks||[]).find(function(t) { return t.id === d.depends_on_task_id; });
                    var depStatus = depTask ? depTask.status : 'unknown';
                    html += '<div class="detail-dep">';
                    html += '<span class="detail-dep-type">' + esc(d.dependency_type || 'blocks') + '</span>';
                    html += '<span class="detail-dep-id" onclick="openDetail(\\'' + esc(d.depends_on_task_id) + '\\')">' + esc(d.depends_on_task_id) + '</span>';
                    if (depTask) {
                        html += '<span class="detail-dep-status ' + depStatus + '">' + esc(depStatus.replace('_',' ')) + '</span>';
                    }
                    html += '</div>';
                });
                html += '</div></div>';
            }

            // Activity
            html += '<div class="detail-section">';
            html += '<div class="detail-section-title">Activity</div>';
            if (taskActivity.length > 0) {
                html += '<div class="detail-activity">';
                taskActivity.forEach(function(a) {
                    var iconClass = a.activity_type === 'status_change' ? 'status' : a.activity_type === 'note' ? 'note' : 'file';
                    var iconChar = a.activity_type === 'status_change' ? '→' : a.activity_type === 'note' ? '📝' : '📎';
                    html += '<div class="activity-item">';
                    html += '<div class="activity-icon ' + iconClass + '">' + iconChar + '</div>';
                    html += '<div class="activity-content">';
                    html += '<div class="activity-text">';
                    if (a.actor) html += '<span class="activity-actor">' + esc(a.actor) + '</span> ';
                    if (a.activity_type === 'status_change') {
                        html += 'Changed status';
                        if (a.old_value) html += ' from <strong>' + esc(a.old_value) + '</strong>';
                        if (a.new_value) html += ' to <strong>' + esc(a.new_value) + '</strong>';
                    } else {
                        html += esc(a.description || a.activity_type);
                    }
                    html += '</div>';
                    html += '<div class="activity-time">' + formatTime(a.created_at) + '</div>';
                    html += '</div></div>';
                });
                html += '</div>';
            } else {
                html += '<div class="empty-state">No activity recorded</div>';
            }
            html += '</div>';

            // Metadata
            html += '<div class="detail-section">';
            html += '<div class="detail-section-title">Details</div>';
            html += '<div class="detail-meta">';
            if (epic.title) {
                html += '<div class="meta-item"><div class="meta-label">Epic</div><div class="meta-value">' + esc(epic.title) + '</div></div>';
            }
            if (story.title) {
                html += '<div class="meta-item"><div class="meta-label">Story</div><div class="meta-value">' + esc(story.title) + '</div></div>';
            }
            if (task.estimate_hours) {
                html += '<div class="meta-item"><div class="meta-label">Estimate</div><div class="meta-value">' + task.estimate_hours + ' hours</div></div>';
            }
            if (task.actual_hours) {
                html += '<div class="meta-item"><div class="meta-label">Actual</div><div class="meta-value">' + task.actual_hours + ' hours</div></div>';
            }
            if (task.created_by) {
                html += '<div class="meta-item"><div class="meta-label">Created By</div><div class="meta-value">' + esc(task.created_by) + '</div></div>';
            }
            if (task.created_at) {
                html += '<div class="meta-item"><div class="meta-label">Created</div><div class="meta-value">' + formatTime(task.created_at) + '</div></div>';
            }
            if (task.updated_at) {
                html += '<div class="meta-item"><div class="meta-label">Updated</div><div class="meta-value">' + formatTime(task.updated_at) + '</div></div>';
            }
            html += '</div></div>';

            panel.innerHTML = html;
        }

        function formatTime(isoStr) {
            if (!isoStr) return '';
            try {
                var d = new Date(isoStr);
                var now = new Date();
                var diff = now - d;
                if (diff < 60000) return 'Just now';
                if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
                if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
                if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
                return d.toLocaleDateString();
            } catch(e) { return isoStr; }
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(function() {
                showToast('Copied: ' + text);
            }).catch(function() {
                showToast('Failed to copy');
            });
        }

        function showToast(msg) {
            var toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 2000);
        }

        // Keyboard handler for ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && currentTaskId) closeDetail();
        });

        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>'''
