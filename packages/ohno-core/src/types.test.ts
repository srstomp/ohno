/**
 * Tests for type definitions
 */

import { describe, it, expect } from "vitest";
import type { Story, StoryStatus, GetStoriesOptions, FieldSet } from "./types.js";

describe("Story Types", () => {
  describe("StoryStatus", () => {
    it("should allow valid story status values", () => {
      const validStatuses: StoryStatus[] = ["todo", "in_progress", "done"];
      expect(validStatuses).toHaveLength(3);
    });
  });

  describe("Story Interface", () => {
    it("should allow creation of a valid story object", () => {
      const story: Story = {
        id: "story-123",
        epic_id: "epic-456",
        title: "User Authentication",
        description: "Implement user login and registration",
        status: "todo",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };

      expect(story.id).toBe("story-123");
      expect(story.epic_id).toBe("epic-456");
      expect(story.title).toBe("User Authentication");
      expect(story.description).toBe("Implement user login and registration");
      expect(story.status).toBe("todo");
    });

    it("should allow null epic_id", () => {
      const story: Story = {
        id: "story-123",
        epic_id: null,
        title: "Standalone Story",
        description: null,
        status: "in_progress",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };

      expect(story.epic_id).toBeNull();
    });

    it("should allow null description", () => {
      const story: Story = {
        id: "story-123",
        epic_id: "epic-456",
        title: "Story without description",
        description: null,
        status: "done",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };

      expect(story.description).toBeNull();
    });

    it("should enforce required fields", () => {
      // This test validates TypeScript compilation
      // If any required field is missing, it won't compile
      const story: Story = {
        id: "story-123",
        epic_id: null,
        title: "Required fields test",
        description: null,
        status: "todo",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };

      expect(story).toBeDefined();
    });

    it("should match database schema structure", () => {
      // Verify all database fields are present
      const story: Story = {
        id: "story-db-test",
        epic_id: "epic-123",
        title: "Database Schema Test",
        description: "Testing schema match",
        status: "in_progress",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };

      // Verify all expected properties exist
      expect(story).toHaveProperty("id");
      expect(story).toHaveProperty("epic_id");
      expect(story).toHaveProperty("title");
      expect(story).toHaveProperty("description");
      expect(story).toHaveProperty("status");
      expect(story).toHaveProperty("created_at");
      expect(story).toHaveProperty("updated_at");
    });
  });

  describe("GetStoriesOptions Interface", () => {
    it("should allow filtering by epic_id", () => {
      const options: GetStoriesOptions = {
        epic_id: "epic-123",
      };

      expect(options.epic_id).toBe("epic-123");
    });

    it("should allow filtering by null epic_id for orphan stories", () => {
      const options: GetStoriesOptions = {
        epic_id: null,
      };

      expect(options.epic_id).toBeNull();
    });

    it("should allow filtering by status", () => {
      const options: GetStoriesOptions = {
        status: "in_progress",
      };

      expect(options.status).toBe("in_progress");
    });

    it("should support pagination with limit and offset", () => {
      const options: GetStoriesOptions = {
        limit: 10,
        offset: 20,
      };

      expect(options.limit).toBe(10);
      expect(options.offset).toBe(20);
    });

    it("should allow all fields to be optional", () => {
      const options: GetStoriesOptions = {};

      expect(options).toBeDefined();
    });

    it("should allow combination of filters", () => {
      const options: GetStoriesOptions = {
        epic_id: "epic-456",
        status: "done",
        limit: 5,
        offset: 0,
      };

      expect(options.epic_id).toBe("epic-456");
      expect(options.status).toBe("done");
      expect(options.limit).toBe(5);
      expect(options.offset).toBe(0);
    });
  });
});

describe("FieldSet type", () => {
  it("should accept valid field set values", () => {
    const minimal: FieldSet = "minimal";
    const standard: FieldSet = "standard";
    const full: FieldSet = "full";
    expect(minimal).toBe("minimal");
    expect(standard).toBe("standard");
    expect(full).toBe("full");
  });
});
