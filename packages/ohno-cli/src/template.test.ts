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
      expect(KANBAN_TEMPLATE).toContain("let filters = { epic: '', priority: '', type: '', story: '', groupBy: 'none' }");
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
      expect(KANBAN_TEMPLATE).toContain("let filters = { epic: '', priority: '', type: '', story: '', groupBy: 'none' }");
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
});
