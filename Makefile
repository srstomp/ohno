.PHONY: build test clean publish publish-patch publish-minor publish-major dev help

# Default target
help:
	@echo "Ohno - Task Management for AI Workflows"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Development:"
	@echo "  build        Build all packages"
	@echo "  test         Run all tests"
	@echo "  dev          Start development mode"
	@echo "  clean        Remove build artifacts"
	@echo ""
	@echo "Publishing:"
	@echo "  publish-patch   Bump patch version and publish (0.5.1 → 0.5.2)"
	@echo "  publish-minor   Bump minor version and publish (0.5.1 → 0.6.0)"
	@echo "  publish-major   Bump major version and publish (0.5.1 → 1.0.0)"
	@echo ""
	@echo "Other:"
	@echo "  serve        Start local kanban server (requires .ohno/)"
	@echo "  init         Initialize .ohno/ directory"

# Development targets
build:
	cd packages && npm run build

test:
	cd packages && npm run test

dev:
	cd packages && npm run dev

clean:
	cd packages && npm run clean

# Publishing targets
publish-patch:
	$(MAKE) _publish BUMP=patch

publish-minor:
	$(MAKE) _publish BUMP=minor

publish-major:
	$(MAKE) _publish BUMP=major

_publish: test
	@echo "Publishing $(BUMP) version..."
	cd packages && npm version $(BUMP) --workspaces --no-git-tag-version
	$(MAKE) build
	cd packages && npm publish --workspace @stevestomp/ohno-core --access public
	cd packages && npm publish --workspace @stevestomp/ohno-mcp --access public
	cd packages && npm publish --workspace @stevestomp/ohno-cli --access public
	@VERSION=$$(node -p "require('./packages/ohno-core/package.json').version"); \
	git add -A && \
	git commit -m "chore: Release v$$VERSION" && \
	git tag "v$$VERSION" && \
	git push origin master --tags
	@echo "Published successfully!"

# Convenience targets
serve:
	npx @stevestomp/ohno-cli serve

init:
	npx @stevestomp/ohno-cli init