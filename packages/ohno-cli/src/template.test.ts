/**
 * Tests for Kanban HTML template
 */

import { describe, it, expect } from "vitest";
import { KANBAN_TEMPLATE } from "./template.js";

describe("Kanban Template", () => {
  describe("Filter functionality", () => {
    it("should include epic filter dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('id="filterEpic"');
      expect(KANBAN_TEMPLATE).toContain("Epic</span>");
    });

    it("should include priority filter dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('id="filterPriority"');
      expect(KANBAN_TEMPLATE).toContain("Priority</span>");
    });

    it("should include type filter dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('id="filterType"');
      expect(KANBAN_TEMPLATE).toContain("Type</span>");
    });

    it("should include story filter dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('id="filterStory"');
      expect(KANBAN_TEMPLATE).toContain("Story</span>");
    });

    it("should initialize filters object with story property", () => {
      expect(KANBAN_TEMPLATE).toContain("let filters = { epic: '', priority: '', type: '', story: '', groupBy: 'none', viewMode: 'columns' }");
    });

    it("should populate story filter from data.stories", () => {
      // The template should iterate over data.stories to populate the dropdown
      expect(KANBAN_TEMPLATE).toMatch(/data\.stories.*forEach/);
    });

    it("should set story filter value after rendering", () => {
      expect(KANBAN_TEMPLATE).toContain("document.getElementById('filterStory').value = filters.story");
    });

    it("should add change handler for story filter", () => {
      expect(KANBAN_TEMPLATE).toContain("document.getElementById('filterStory').onchange = function() { setFilter('story', this.value); }");
    });

    it("should filter tasks by story_id in getFilteredTasks", () => {
      // Check that the filtering logic includes story filtering
      expect(KANBAN_TEMPLATE).toMatch(/if \(filters\.story\).*story_id/);
    });
  });

  describe("Group By functionality", () => {
    it("should initialize filters object with groupBy property set to 'none'", () => {
      expect(KANBAN_TEMPLATE).toContain("let filters = { epic: '', priority: '', type: '', story: '', groupBy: 'none', viewMode: 'columns' }");
    });

    it("should include Group By filter dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('id="filterGroupBy"');
      expect(KANBAN_TEMPLATE).toContain("Group By</span>");
    });

    it("should include None, Epic, and Story options in Group By dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('<option value="none">None</option>');
      expect(KANBAN_TEMPLATE).toContain('<option value="epic">Epic</option>');
      expect(KANBAN_TEMPLATE).toContain('<option value="story">Story</option>');
    });

    it("should set groupBy filter value after rendering", () => {
      expect(KANBAN_TEMPLATE).toContain("document.getElementById('filterGroupBy').value = filters.groupBy");
    });

    it("should add change handler for groupBy filter", () => {
      expect(KANBAN_TEMPLATE).toContain("document.getElementById('filterGroupBy').onchange = function() { setFilter('groupBy', this.value); }");
    });

    it("should include CSS for group headers", () => {
      expect(KANBAN_TEMPLATE).toContain(".group-header {");
      expect(KANBAN_TEMPLATE).toContain(".group-name {");
    });

    it("should include renderGroupedCards function", () => {
      expect(KANBAN_TEMPLATE).toContain("function renderGroupedCards(tasks, groupBy)");
    });

    it("should use renderGroupedCards in column rendering", () => {
      expect(KANBAN_TEMPLATE).toContain("colHtml += renderGroupedCards(tasks, filters.groupBy)");
    });

    it("should handle None grouping (flat list)", () => {
      expect(KANBAN_TEMPLATE).toMatch(/if \(groupBy === 'none'/);
    });

    it("should group tasks by epic_id when groupBy is epic", () => {
      expect(KANBAN_TEMPLATE).toMatch(/if \(groupBy === 'epic'\)/);
      expect(KANBAN_TEMPLATE).toContain("task.epic_id");
    });

    it("should group tasks by story_id when groupBy is story", () => {
      expect(KANBAN_TEMPLATE).toContain("task.story_id");
    });

    it("should show orphan epic group as '(No Epic)'", () => {
      expect(KANBAN_TEMPLATE).toContain("'(No Epic)'");
    });

    it("should show orphan story group as '(No Story)'", () => {
      expect(KANBAN_TEMPLATE).toContain("'(No Story)'");
    });

    it("should use getEpicCompletion for epic groups", () => {
      expect(KANBAN_TEMPLATE).toContain("getEpicCompletion");
    });

    it("should use getStoryCompletion for story groups", () => {
      expect(KANBAN_TEMPLATE).toContain("getStoryCompletion");
    });
  });

  describe("Hierarchical view functionality", () => {
    it("should initialize filters object with viewMode property set to 'columns'", () => {
      expect(KANBAN_TEMPLATE).toContain("let filters = { epic: '', priority: '', type: '', story: '', groupBy: 'none', viewMode: 'columns' }");
    });

    it("should include View Mode filter dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('id="filterViewMode"');
      expect(KANBAN_TEMPLATE).toContain("View</span>");
    });

    it("should include Columns and Hierarchy options in View Mode dropdown", () => {
      expect(KANBAN_TEMPLATE).toContain('<option value="columns">Columns</option>');
      expect(KANBAN_TEMPLATE).toContain('<option value="hierarchy">Hierarchy</option>');
    });

    it("should set viewMode filter value after rendering", () => {
      expect(KANBAN_TEMPLATE).toContain("document.getElementById('filterViewMode').value = filters.viewMode");
    });

    it("should add change handler for viewMode filter", () => {
      expect(KANBAN_TEMPLATE).toContain("document.getElementById('filterViewMode').onchange = function() { setFilter('viewMode', this.value); }");
    });

    it("should include CSS for hierarchy view", () => {
      expect(KANBAN_TEMPLATE).toContain(".hierarchy-view {");
      expect(KANBAN_TEMPLATE).toContain(".epic-section");
      expect(KANBAN_TEMPLATE).toContain(".story-section");
      expect(KANBAN_TEMPLATE).toContain(".orphan-section");
    });

    it("should include CSS for collapsible sections", () => {
      expect(KANBAN_TEMPLATE).toContain(".collapse-icon");
      expect(KANBAN_TEMPLATE).toContain(".epic-header");
      expect(KANBAN_TEMPLATE).toContain(".story-header");
      expect(KANBAN_TEMPLATE).toContain(".collapsed");
    });

    it("should include CSS for hierarchy task items", () => {
      expect(KANBAN_TEMPLATE).toContain(".hierarchy-task {");
      expect(KANBAN_TEMPLATE).toContain(".status-badge");
      expect(KANBAN_TEMPLATE).toContain(".task-id-link");
    });

    it("should include CSS for status badges", () => {
      expect(KANBAN_TEMPLATE).toContain(".status-todo");
      expect(KANBAN_TEMPLATE).toContain(".status-in_progress");
      expect(KANBAN_TEMPLATE).toContain(".status-review");
      expect(KANBAN_TEMPLATE).toContain(".status-done");
      expect(KANBAN_TEMPLATE).toContain(".status-blocked");
    });

    it("should include toggleSection function", () => {
      expect(KANBAN_TEMPLATE).toContain("function toggleSection(sectionId)");
    });

    it("should expose toggleSection to window object", () => {
      expect(KANBAN_TEMPLATE).toContain("window.toggleSection = toggleSection");
    });

    it("should include renderHierarchyView function", () => {
      expect(KANBAN_TEMPLATE).toContain("function renderHierarchyView(tasks)");
    });

    it("should include renderHierarchyTask function", () => {
      expect(KANBAN_TEMPLATE).toContain("function renderHierarchyTask(task)");
    });

    it("should conditionally render hierarchy view when viewMode is hierarchy", () => {
      expect(KANBAN_TEMPLATE).toMatch(/if \(filters\.viewMode === 'hierarchy'\)/);
    });

    it("should render column board when viewMode is not hierarchy", () => {
      expect(KANBAN_TEMPLATE).toContain("board.className = 'board'");
    });

    it("should handle orphan tasks in '[No Epic]' section", () => {
      expect(KANBAN_TEMPLATE).toContain("[No Epic]");
    });

    it("should include collapse indicators (▼ expanded, ▶ collapsed)", () => {
      expect(KANBAN_TEMPLATE).toContain("▼");
      expect(KANBAN_TEMPLATE).toContain("▶");
    });

    it("should show completion badges on Epic headers", () => {
      expect(KANBAN_TEMPLATE).toContain(".hierarchy-badge");
    });

    it("should attach click handlers to hierarchy tasks", () => {
      expect(KANBAN_TEMPLATE).toMatch(/hierarchyEl.*querySelectorAll.*\.hierarchy-task/);
    });
  });

  describe("Breadcrumb functionality", () => {
    it("should include CSS for card breadcrumb", () => {
      expect(KANBAN_TEMPLATE).toContain(".card-breadcrumb {");
    });

    it("should style breadcrumb with small font size", () => {
      expect(KANBAN_TEMPLATE).toMatch(/\.card-breadcrumb[\s\S]*?font-size:\s*0\.65rem/);
    });

    it("should style breadcrumb with muted color", () => {
      expect(KANBAN_TEMPLATE).toMatch(/\.card-breadcrumb[\s\S]*?color:\s*var\(--text-muted\)/);
    });

    it("should include text overflow ellipsis for breadcrumb", () => {
      expect(KANBAN_TEMPLATE).toMatch(/\.card-breadcrumb[\s\S]*?text-overflow:\s*ellipsis/);
    });

    it("should add breadcrumb when task has epic", () => {
      // The renderCard function should check for epic and add breadcrumb
      expect(KANBAN_TEMPLATE).toMatch(/if \(task\.epic_id/);
      expect(KANBAN_TEMPLATE).toContain("card-breadcrumb");
    });

    it("should show epic priority in breadcrumb", () => {
      // Breadcrumb should include epic priority badge
      expect(KANBAN_TEMPLATE).toMatch(/epic_priority/);
    });

    it("should show arrow indicator in breadcrumb", () => {
      // Breadcrumb should include → arrow
      expect(KANBAN_TEMPLATE).toContain("→");
    });

    it("should format breadcrumb as 'Epic (Priority) / Story →' when both exist", () => {
      // Check for story separator in breadcrumb context
      expect(KANBAN_TEMPLATE).toMatch(/epic.*story/i);
    });
  });

  describe("Orphan indicator functionality", () => {
    it("should include CSS for orphan indicator", () => {
      expect(KANBAN_TEMPLATE).toContain(".card-orphan {");
    });

    it("should style orphan indicator with small font size", () => {
      expect(KANBAN_TEMPLATE).toMatch(/\.card-orphan[\s\S]*?font-size:\s*0\.6rem/);
    });

    it("should style orphan indicator with orange color", () => {
      expect(KANBAN_TEMPLATE).toMatch(/\.card-orphan[\s\S]*?color:\s*var\(--orange\)/);
    });

    it("should check for missing story_id in renderCard", () => {
      // The renderCard function should check if task has no story_id
      expect(KANBAN_TEMPLATE).toMatch(/if \(!task\.story_id\)/);
    });

    it("should display orphan indicator for tasks without story", () => {
      // Should show warning icon and text for orphaned tasks
      expect(KANBAN_TEMPLATE).toContain("card-orphan");
      expect(KANBAN_TEMPLATE).toContain("No story");
    });

    it("should use warning symbol for orphan indicator", () => {
      // Should include a warning or alert symbol
      expect(KANBAN_TEMPLATE).toMatch(/[⚠\u26A0]/);
    });
  });

  describe("Template structure", () => {
    it("should be valid HTML", () => {
      expect(KANBAN_TEMPLATE).toContain("<!DOCTYPE html>");
      expect(KANBAN_TEMPLATE).toContain("</html>");
    });

    it("should include filters container", () => {
      expect(KANBAN_TEMPLATE).toContain("filtersEl.className = 'filters'");
    });

    it("should include getFilteredTasks function", () => {
      expect(KANBAN_TEMPLATE).toContain("function getFilteredTasks()");
    });
  });

  describe("State preservation on data updates (Issue #23)", () => {
    it("should extract and parse new data from fetched HTML instead of reloading", () => {
      // checkUpdates should extract KANBAN_DATA from HTML response via regex
      expect(KANBAN_TEMPLATE).toContain("window\\.KANBAN_DATA");
      expect(KANBAN_TEMPLATE).toContain("JSON.parse(dataMatch[1])");
    });

    it("should update data object in place without location.reload()", () => {
      // Should assign new data to local variable instead of always reloading
      expect(KANBAN_TEMPLATE).toContain("data = newData");
      expect(KANBAN_TEMPLATE).toContain("lastSync = data.synced_at");
    });

    it("should re-render the board after data update", () => {
      // Should call render() after updating data
      expect(KANBAN_TEMPLATE).toMatch(/data = newData[\s\S]*?render\(\)/);
    });

    it("should re-render detail panel if open after data update", () => {
      // Should check currentTaskId and re-render detail panel with updated data
      expect(KANBAN_TEMPLATE).toMatch(/if \(currentTaskId\)[\s\S]*?renderDetailPanel\(task\)/);
    });

    it("should fall back to location.reload() only on parse errors", () => {
      // Parse errors should still trigger reload as fallback
      expect(KANBAN_TEMPLATE).toContain("} catch(parseErr) {");
      expect(KANBAN_TEMPLATE).toContain("location.reload()");
    });
  });
});
