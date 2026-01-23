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
      expect(KANBAN_TEMPLATE).toContain("let filters = { epic: '', priority: '', type: '', story: '' }");
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
