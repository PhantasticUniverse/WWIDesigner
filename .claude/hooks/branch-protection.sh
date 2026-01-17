#!/bin/bash
# Branch Protection Hook
# Prevents edits on protected branches (main, master)

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# Protected branches
PROTECTED_BRANCHES="main master"

# Check if current branch is protected
for protected in $PROTECTED_BRANCHES; do
    if [ "$BRANCH" = "$protected" ]; then
        echo "BLOCKED: Cannot edit files on protected branch '$BRANCH'"
        echo ""
        echo "Please create a feature branch first:"
        echo "  git checkout -b feature/your-feature-name"
        echo ""
        echo "Or checkout an existing branch:"
        echo "  git branch -a  # list branches"
        echo "  git checkout branch-name"
        exit 2  # Exit code 2 blocks the operation
    fi
done

# Not on a protected branch, allow the edit
exit 0
