# WWIDesigner - Project Memory

## Quick Reference

**Runtime:** Bun (not Node.js)
**Language:** TypeScript with strict mode
**Working Directory:** `wwi-designer-web/`

## Essential Commands

```bash
# Development
cd wwi-designer-web
bun install              # Install dependencies
bun run dev              # Development server (hot reload)
bun run start            # Production server

# Testing
bun test                 # Run all 811 unit tests
bun test --watch         # Watch mode
bun run test:e2e         # Playwright E2E tests

# Type checking
bunx tsc --noEmit        # Should show 0 errors
```

## Project Structure

```
WWIDesigner/
├── wwi-designer-web/    # Main TypeScript/Bun application
│   ├── src/
│   │   ├── core/        # Acoustic engine & optimization
│   │   │   ├── math/    # Complex, TransferMatrix
│   │   │   ├── physics/ # Air properties (CIPM-2007)
│   │   │   ├── geometry/# Bore, holes, mouthpiece
│   │   │   ├── modelling/# Calculator, tuner, range
│   │   │   └── optimization/  # 6 algorithms, 51 objectives
│   │   ├── models/      # Instrument, Tuning interfaces
│   │   ├── utils/       # XML converter
│   │   └── web/         # Server & frontend
│   ├── tests/           # Unit, parity, E2E tests
│   ├── presets/NAF/     # 67 NAF preset files
│   ├── docs/            # Technical documentation
│   └── CLAUDE.md        # Detailed developer guide
└── WWIDesigner/         # Legacy Java application
```

## What This Project Does

1. **Predicts Playing Frequencies** - Acoustic modeling via Transfer Matrix Method
2. **Optimizes Instrument Design** - 6 algorithms, 51 objective functions
3. **Visualizes Instruments** - Cross-section diagrams
4. **Web Interface** - Bun.serve API at localhost:3000

## Key Technical Details

- **Acoustic Engine:** Exact parity with Java WWIDesigner (15+ significant digits)
- **Optimization:** DIRECT, BOBYQA, Brent, CMA-ES, Simplex, Powell
- **TypeScript:** strict mode + noUncheckedIndexedAccess + noImplicitOverride
- **Tests:** 811 unit tests + 12 E2E tests

## Important Notes

- Always use `bun` commands, never `npm` or `yarn`
- All work happens in `wwi-designer-web/` directory
- See `wwi-designer-web/CLAUDE.md` for comprehensive documentation
- See `wwi-designer-web/docs/` for acoustic theory documentation

## Known Issues

No known issues at this time. Previously resolved:
- ✅ CMA-ES eigendecomposition - Implemented Jacobi algorithm
- ✅ Chrome file input - Fixed by appending input to DOM

## Claude Code Configuration

- **Hooks:** Branch protection, auto-typecheck, auto-test
- **Skills:** acoustic-theory, optimization-algorithms, typescript-patterns, bun-runtime
- **Local settings:** `.claude/settings.local.json` (personal permissions)
