#!/bin/bash
# Auto Type Check Hook
# Runs TypeScript compiler after .ts file edits

TOOL_INPUT="$1"

# Extract file path from tool input JSON
# The input contains "file_path" for Edit/Write tools
FILE_PATH=$(echo "$TOOL_INPUT" | grep -oE '"file_path"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)".*/\1/')

# Skip if not a TypeScript file
if [[ ! "$FILE_PATH" =~ \.ts$ ]]; then
    exit 0
fi

# Skip if not in wwi-designer-web directory
if [[ ! "$FILE_PATH" =~ wwi-designer-web ]]; then
    exit 0
fi

# Change to the web project directory
cd "$(dirname "$0")/../../wwi-designer-web" 2>/dev/null || exit 0

# Run type check
echo "Running type check..."
OUTPUT=$(bunx tsc --noEmit 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "TypeScript errors found:"
    echo "$OUTPUT" | head -30  # Limit output to first 30 lines

    # Count total errors
    ERROR_COUNT=$(echo "$OUTPUT" | grep -c "error TS")
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo ""
        echo "Total errors: $ERROR_COUNT"
    fi
else
    echo "Type check passed (0 errors)"
fi

# Always exit 0 - we don't want to block edits, just report errors
exit 0
