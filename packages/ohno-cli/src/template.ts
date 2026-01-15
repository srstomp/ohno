/**
 * Kanban HTML template
 * Self-contained HTML with embedded styles and JavaScript
 * Note: Data comes from local SQLite (trusted source) and esc() function escapes HTML
 */

export const KANBAN_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ohno - Kanban Board</title>
    <script>window.KANBAN_DATA = {{KANBAN_DATA}};</script>
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

        .stats { display: flex; gap: 1.5rem; font-size: 0.875rem; }
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

        .filter-group { display: flex; align-items: center; gap: 0.5rem; }

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
            cursor: pointer;
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

        .card-id { font-size: 0.7rem; color: var(--text-muted); font-family: monospace; }

        .card-priority { font-size: 0.6rem; padding: 0.1rem 0.3rem; border-radius: 3px; font-weight: 600; }
        .priority-P0 { background: var(--red); color: white; }
        .priority-P1 { background: var(--orange); color: white; }
        .priority-P2 { background: var(--yellow); color: black; }
        .priority-P3 { background: var(--text-muted); color: white; }

        .card-title { font-size: 0.8rem; font-weight: 500; line-height: 1.3; margin-bottom: 0.375rem; }

        .card-meta { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); }
        .card-type { background: var(--bg-secondary); padding: 0.1rem 0.3rem; border-radius: 3px; }

        .card-epic {
            font-size: 0.65rem;
            color: var(--blue);
            margin-top: 0.375rem;
            padding-top: 0.375rem;
            border-top: 1px solid var(--border);
        }

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

        .no-data code { background: var(--bg-card); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.875rem; }

        .detail-backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            opacity: 0; visibility: hidden;
            transition: opacity 0.2s, visibility 0.2s;
            z-index: 200;
        }
        .detail-backdrop.open { opacity: 1; visibility: visible; }

        .detail-panel {
            position: fixed; top: 0; right: -600px;
            width: 600px; max-width: 100vw; height: 100vh;
            background: var(--bg-secondary);
            border-left: 1px solid var(--border);
            overflow-y: auto;
            transition: right 0.3s ease-out;
            z-index: 201;
        }
        .detail-panel.open { right: 0; }

        .detail-header {
            padding: 1.25rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            position: sticky; top: 0;
            background: var(--bg-secondary);
            z-index: 1;
        }

        .detail-id { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; margin-bottom: 0.5rem; }
        .detail-title { font-size: 1.125rem; font-weight: 600; line-height: 1.3; margin-bottom: 0.75rem; }
        .detail-badges { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .detail-badge { font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 500; }

        .detail-close {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            width: 32px; height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
            margin-left: 1rem;
        }
        .detail-close:hover { background: var(--bg-primary); color: var(--text-primary); }

        .detail-section { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
        .detail-section:last-child { border-bottom: none; }
        .detail-section-title {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.75rem;
            font-weight: 600;
        }

        .detail-description { font-size: 0.875rem; line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; }
        .detail-context { font-size: 0.8rem; line-height: 1.5; color: var(--text-secondary); background: var(--bg-card); padding: 0.75rem; border-radius: 6px; white-space: pre-wrap; }
        .detail-blockers { background: rgba(239,68,68,0.1); border: 1px solid var(--red); padding: 0.75rem; border-radius: 6px; color: var(--red); font-size: 0.875rem; line-height: 1.5; }
        .detail-handoff { background: rgba(59,130,246,0.1); border: 1px solid var(--blue); padding: 0.75rem; border-radius: 6px; color: var(--text-primary); font-size: 0.875rem; line-height: 1.5; }

        .detail-progress { display: flex; align-items: center; gap: 0.75rem; }
        .detail-progress-bar { flex: 1; height: 8px; background: var(--bg-card); border-radius: 4px; overflow: hidden; }
        .detail-progress-fill { height: 100%; background: var(--green); border-radius: 4px; }
        .detail-progress-text { font-size: 0.875rem; font-weight: 600; min-width: 40px; text-align: right; }

        .detail-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
        .meta-item { background: var(--bg-card); padding: 0.625rem; border-radius: 4px; }
        .meta-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem; }
        .meta-value { font-size: 0.875rem; color: var(--text-primary); }

        .detail-activity { display: flex; flex-direction: column; gap: 0.75rem; }
        .activity-item { display: flex; gap: 0.75rem; font-size: 0.8rem; }
        .activity-icon { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.7rem; }
        .activity-icon.status { background: var(--blue); color: white; }
        .activity-icon.note { background: var(--purple); color: white; }
        .activity-content { flex: 1; min-width: 0; }
        .activity-text { color: var(--text-primary); margin-bottom: 0.25rem; }
        .activity-time { font-size: 0.7rem; color: var(--text-muted); }

        .empty-state { text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.8rem; font-style: italic; }

        .toast {
            position: fixed; bottom: 20px; left: 50%;
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
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    </style>
</head>
<body>
    <div id="app"><div class="no-data">Loading...</div></div>
    <div class="detail-backdrop" id="detailBackdrop"></div>
    <div class="detail-panel" id="detailPanel"></div>
    <div class="toast" id="toast"></div>
    <script>
        // All data comes from local SQLite (trusted source). esc() escapes HTML chars.
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
        let currentTaskId = null;

        function init() {
            document.getElementById('detailBackdrop').onclick = closeDetail;
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
            } catch(e) {}
        }

        function esc(s) {
            if (s == null) return '';
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        function render() {
            const s = data.stats || {};
            const total = s.total_tasks || 1;
            const app = document.getElementById('app');
            app.textContent = '';

            const header = document.createElement('header');
            header.className = 'header';
            header.innerHTML = '<div style="display:flex;align-items:center;gap:1rem"><h1>' + esc(data.projects && data.projects[0] ? data.projects[0].name : 'Ohno') + '</h1><div class="sync-status"><span class="sync-dot"></span><span>' + new Date(data.synced_at).toLocaleTimeString() + '</span></div></div><div class="stats"><div><span class="stat-value">' + s.done_tasks + '/' + s.total_tasks + '</span><span class="stat-label">tasks</span></div><div><span class="stat-value">' + s.completion_percent + '%</span><span class="stat-label">done</span></div><div><span class="stat-value">' + s.in_progress_tasks + '</span><span class="stat-label">active</span></div><div><span class="stat-value">' + s.blocked_tasks + '</span><span class="stat-label">blocked</span></div></div>';
            app.appendChild(header);

            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar-container';
            progressBar.innerHTML = '<div class="progress-bar"><div class="progress-done" style="width:' + (s.done_tasks/total*100) + '%"></div><div class="progress-review" style="width:' + (s.review_tasks/total*100) + '%"></div><div class="progress-in-progress" style="width:' + (s.in_progress_tasks/total*100) + '%"></div><div class="progress-blocked" style="width:' + (s.blocked_tasks/total*100) + '%"></div></div>';
            app.appendChild(progressBar);

            const filtersEl = document.createElement('div');
            filtersEl.className = 'filters';
            let filterHtml = '<div class="filter-group"><span class="filter-label">Epic</span><select class="filter-select" id="filterEpic"><option value="">All</option>';
            (data.epics||[]).forEach(e => { filterHtml += '<option value="' + esc(e.id) + '">' + esc(e.title) + '</option>'; });
            filterHtml += '</select></div><div class="filter-group"><span class="filter-label">Priority</span><select class="filter-select" id="filterPriority"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option></select></div>';
            filtersEl.innerHTML = filterHtml;
            app.appendChild(filtersEl);
            document.getElementById('filterEpic').onchange = function() { setFilter('epic', this.value); };
            document.getElementById('filterPriority').onchange = function() { setFilter('priority', this.value); };

            const board = document.createElement('div');
            board.className = 'board';
            COLUMNS.forEach(col => {
                const colEl = document.createElement('div');
                colEl.className = 'column column-' + col.id;
                const tasks = getFilteredTasks().filter(t => t.status === col.status);
                let colHtml = '<div class="column-header"><span class="column-title">' + esc(col.title) + '</span><span class="column-count">' + tasks.length + '</span></div><div class="column-cards">';
                if (tasks.length) {
                    tasks.forEach(task => { colHtml += renderCard(task); });
                } else {
                    colHtml += '<div class="empty">No tasks</div>';
                }
                colHtml += '</div>';
                colEl.innerHTML = colHtml;
                board.appendChild(colEl);
            });
            app.appendChild(board);

            board.querySelectorAll('.card').forEach(card => {
                card.onclick = function() { openDetail(this.dataset.id); };
            });
        }

        function renderCard(task) {
            let html = '<div class="card" data-id="' + esc(task.id) + '">';
            html += '<div class="card-header"><span class="card-id">' + esc(task.id) + '</span>';
            if (task.epic_priority) html += '<span class="card-priority priority-' + esc(task.epic_priority) + '">' + esc(task.epic_priority) + '</span>';
            html += '</div><div class="card-title">' + esc(task.title) + '</div>';
            const deps = (data.task_dependencies||[]).filter(d => d.task_id === task.id);
            const blockedByDeps = deps.some(d => {
                const depTask = (data.tasks||[]).find(t => t.id === d.depends_on_task_id);
                return depTask && depTask.status !== 'done';
            });
            if (blockedByDeps && task.status === 'todo') {
                html += '<div style="font-size:0.65rem;color:var(--orange);margin-bottom:0.25rem">&#9203; Waiting on deps</div>';
            }
            html += '<div class="card-meta">' + (task.task_type ? '<span class="card-type">' + esc(task.task_type) + '</span>' : '<span></span>');
            let metaRight = '';
            if (task.progress_percent > 0) metaRight += '<span style="color:var(--green)">' + task.progress_percent + '%</span> ';
            if (task.estimate_hours) metaRight += '<span>' + task.estimate_hours + 'h</span>';
            html += metaRight || '<span></span>';
            html += '</div>';
            if (task.epic_title) html += '<div class="card-epic">' + esc(task.epic_title) + '</div>';
            html += '</div>';
            return html;
        }

        function getFilteredTasks() {
            let tasks = data.tasks || [];
            if (filters.epic) {
                const storyIds = new Set((data.stories||[]).filter(s => s.epic_id === filters.epic).map(s => s.id));
                tasks = tasks.filter(t => storyIds.has(t.story_id));
            }
            if (filters.priority) tasks = tasks.filter(t => t.epic_priority === filters.priority);
            return tasks;
        }

        function setFilter(key, val) { filters[key] = val; render(); }

        function renderNoData() {
            const app = document.getElementById('app');
            app.innerHTML = '<header class="header"><h1>Ohno</h1></header><div class="no-data"><h2 style="margin-bottom:1rem">No Data</h2><p>Run <code>ohno init</code> and create some tasks</p></div>';
        }

        function openDetail(taskId) {
            currentTaskId = taskId;
            const task = (data.tasks||[]).find(t => t.id === taskId);
            if (!task) return;
            renderDetailPanel(task);
            document.getElementById('detailPanel').classList.add('open');
            document.getElementById('detailBackdrop').classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeDetail() {
            document.getElementById('detailPanel').classList.remove('open');
            document.getElementById('detailBackdrop').classList.remove('open');
            document.body.style.overflow = '';
            currentTaskId = null;
        }

        function renderDetailPanel(task) {
            const panel = document.getElementById('detailPanel');
            const activity = (data.task_activity||[]).filter(a => a.task_id === task.id).slice(0, 10);
            const deps = (data.task_dependencies||[]).filter(d => d.task_id === task.id);

            let html = '<div class="detail-header"><div style="flex:1"><div class="detail-id">' + esc(task.id) + '</div><div class="detail-title">' + esc(task.title) + '</div><div class="detail-badges">';
            const statusColors = {todo:'var(--text-muted)',in_progress:'var(--blue)',review:'var(--purple)',done:'var(--green)',blocked:'var(--red)'};
            html += '<span class="detail-badge" style="background:' + (statusColors[task.status]||'var(--text-muted)') + ';color:white">' + esc(task.status) + '</span>';
            if (task.epic_priority) {
                const priColors = {P0:'var(--red)',P1:'var(--orange)',P2:'var(--yellow)',P3:'var(--text-muted)'};
                html += '<span class="detail-badge" style="background:' + (priColors[task.epic_priority]||'var(--text-muted)') + ';color:white">' + esc(task.epic_priority) + '</span>';
            }
            if (task.task_type) html += '<span class="detail-badge" style="background:var(--bg-card)">' + esc(task.task_type) + '</span>';
            html += '</div></div><button class="detail-close" id="closeBtn">&times;</button></div>';

            if (task.progress_percent != null) {
                html += '<div class="detail-section"><div class="detail-section-title">Progress</div><div class="detail-progress"><div class="detail-progress-bar"><div class="detail-progress-fill" style="width:' + (task.progress_percent||0) + '%"></div></div><span class="detail-progress-text">' + (task.progress_percent||0) + '%</span></div></div>';
            }
            if (task.blockers) html += '<div class="detail-section"><div class="detail-section-title">Blockers</div><div class="detail-blockers">' + esc(task.blockers) + '</div></div>';
            if (task.description) html += '<div class="detail-section"><div class="detail-section-title">Description</div><div class="detail-description">' + esc(task.description) + '</div></div>';
            if (task.context_summary) html += '<div class="detail-section"><div class="detail-section-title">Context</div><div class="detail-context">' + esc(task.context_summary) + '</div></div>';
            if (task.handoff_notes) html += '<div class="detail-section"><div class="detail-section-title">Handoff Notes</div><div class="detail-handoff">' + esc(task.handoff_notes) + '</div></div>';

            if (deps.length > 0) {
                html += '<div class="detail-section"><div class="detail-section-title">Dependencies</div><div>';
                deps.forEach(d => {
                    html += '<div style="padding:0.5rem;background:var(--bg-card);border-radius:4px;margin-bottom:0.5rem;font-size:0.8rem" class="dep-link" data-dep-id="' + esc(d.depends_on_task_id) + '"><span style="color:var(--purple);font-family:monospace;cursor:pointer">' + esc(d.depends_on_task_id) + '</span> <span style="color:var(--text-muted);font-size:0.7rem">(' + esc(d.depends_on_status||'unknown') + ')</span></div>';
                });
                html += '</div></div>';
            }

            html += '<div class="detail-section"><div class="detail-section-title">Activity</div>';
            if (activity.length > 0) {
                html += '<div class="detail-activity">';
                activity.forEach(a => {
                    html += '<div class="activity-item"><div class="activity-icon ' + (a.activity_type === 'status_change' ? 'status' : 'note') + '">' + (a.activity_type === 'status_change' ? '→' : '📝') + '</div><div class="activity-content"><div class="activity-text">' + esc(a.description||a.activity_type) + '</div><div class="activity-time">' + formatTime(a.created_at) + '</div></div></div>';
                });
                html += '</div>';
            } else {
                html += '<div class="empty-state">No activity</div>';
            }
            html += '</div>';

            html += '<div class="detail-section"><div class="detail-section-title">Details</div><div class="detail-meta">';
            if (task.epic_title) html += '<div class="meta-item"><div class="meta-label">Epic</div><div class="meta-value">' + esc(task.epic_title) + '</div></div>';
            if (task.story_title) html += '<div class="meta-item"><div class="meta-label">Story</div><div class="meta-value">' + esc(task.story_title) + '</div></div>';
            if (task.estimate_hours) html += '<div class="meta-item"><div class="meta-label">Estimate</div><div class="meta-value">' + task.estimate_hours + 'h</div></div>';
            if (task.created_at) html += '<div class="meta-item"><div class="meta-label">Created</div><div class="meta-value">' + formatTime(task.created_at) + '</div></div>';
            html += '</div></div>';

            panel.innerHTML = html;
            document.getElementById('closeBtn').onclick = closeDetail;
            panel.querySelectorAll('.dep-link').forEach(el => {
                el.onclick = function() { openDetail(this.dataset.depId); };
            });
        }

        function formatTime(isoStr) {
            if (!isoStr) return '';
            try {
                const d = new Date(isoStr);
                const diff = Date.now() - d.getTime();
                if (diff < 60000) return 'Just now';
                if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
                if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
                return d.toLocaleDateString();
            } catch(e) { return isoStr; }
        }

        document.addEventListener('keydown', e => { if (e.key === 'Escape' && currentTaskId) closeDetail(); });
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>`;
