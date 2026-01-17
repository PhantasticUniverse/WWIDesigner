#!/bin/bash
# Auto Test Hook
# Runs tests automatically when test files are modified

TOOL_INPUT="$1"

# Extract file path from tool input JSON
FILE_PATH=$(echo "$TOOL_INPUT" | grep -oE '"file_path"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)".*/\1/')

# Skip if not a test file
if [[ ! "$FILE_PATH" =~ \.test\.ts$ ]] && [[ ! "$FILE_PATH" =~ \.e2e\.ts$ ]]; then
    exit 0
fi

# Skip if not in wwi-designer-web directory
if [[ ! "$FILE_PATH" =~ wwi-designer-web ]]; then
    exit 0
fi

# Change to the web project directory
cd "$(dirname "$0")/../../wwi-designer-web" 2>/dev/null || exit 0

# Extract relative path within wwi-designer-web
RELATIVE_PATH=$(echo "$FILE_PATH" | sed 's|.*/wwi-designer-web/||')

# Check if it's an E2E test
if [[ "$FILE_PATH" =~ \.e2e\.ts$ ]]; then
    echo "Running E2E test: $RELATIVE_PATH"
    # E2E tests use Playwright
    bun run test:e2e "$RELATIVE_PATH" 2>&1 | head -50
else
    echo "Running unit test: $RELATIVE_PATH"
    # Unit tests use bun test
    bun test "$RELATIVE_PATH" 2>&1 | head -50
fi

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "Some tests failed. Review the output above."
else
    echo ""
    echo "All tests passed!"
fi

# Always exit 0 - we don't want to block edits, just report test results
exit 0
