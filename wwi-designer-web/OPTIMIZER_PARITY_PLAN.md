# Optimizer Parity Implementation Plan

## Overview
Systematic plan to achieve full optimizer parity between Java WWIDesigner and TypeScript web version.

## Current State
- **Acoustic Engine:** 100% parity
- **Optimizer:** ~90% parity (DIRECT + BOBYQA + Multi-Start implemented)
- **Objective Functions:** 52/54 implemented (100% complete)
- **Tests:** 685 passing

---

## Phase 1: Wire Up Existing Infrastructure ✅ COMPLETE
**Goal:** Connect sidebar selections to actual optimization calls

### 1.1 Connect Optimizer Selection to API
- [x] Update `showOptimizeModal()` to use `state.selectedOptimizer`
- [x] Update `/api/optimize` endpoint to accept objective function type
- [x] Create factory function to instantiate correct objective function (objective-function-factory.ts)
- [x] Test with existing objective functions
- [x] Add OBJECTIVE_FUNCTION_INFO metadata with displayName, category, description
- [x] Implement getObjectiveFunctionsByCategory() for UI grouping

### 1.2 Connect Multi-start Selection
- [ ] Pass multi-start option to optimizer
- [ ] Implement basic multi-start loop (simplified version first)
- [ ] Test vary bore length option

**Parity Check:** Run same instrument/tuning through Java and web, compare results

---

## Phase 2: Implement BOBYQA Algorithm ✅ COMPLETE
**Goal:** Replace coordinate descent with proper BOBYQA for local refinement

### 2.1 Research & Port
- [x] Study Java's BOBYQAOptimizer (Apache Commons Math)
- [x] Port BOBYQA algorithm to TypeScript (bobyqa-optimizer.ts)
- [x] Implement bounded optimization support
- [x] Add interpolation point management
- [x] Implement trust region framework
- [x] Add finite-difference gradient/Hessian estimation

### 2.2 Integration
- [x] Add BOBYQA to OptimizerType enum handling
- [x] Update two-stage pipeline: DIRECT → BOBYQA
- [x] Add configuration options (number of interpolation points)
- [x] Export BOBYQAOptimizer from optimization/index.ts

### 2.3 Testing
- [x] Unit tests for BOBYQA convergence (20 tests in bobyqa-optimizer.test.ts)
- [x] Tests for bounds handling, evaluation tracking, configuration
- [x] Challenging function tests (Rosenbrock, multimodal)

**Parity Check:** Same optimization problem, compare final error values

---

## Phase 3: Complete Objective Function Coverage ✅ MOSTLY COMPLETE
**Goal:** Implement remaining objective functions

All 52 objective functions have been implemented. Only 2 specialized variants remain.

### 3.1 Global Hole Functions ✅
- [x] GlobalHoleObjectiveFunction
- [x] GlobalHolePositionObjectiveFunction
- [x] GlobalHoleAndTaperObjectiveFunction
- [x] GlobalHoleAndBoreDiameterFromBottomObjectiveFunction
- [x] GlobalHoleAndBoreDiameterFromTopObjectiveFunction
- [x] GlobalBoreFromBottomObjectiveFunction
- [x] GlobalHoleAndBoreFromBottomObjectiveFunction

### 3.2 Single Taper Variants ✅
- [x] SingleTaperNoHoleGroupingObjectiveFunction
- [x] SingleTaperNoHoleGroupingFromTopObjectiveFunction
- [x] SingleTaperHoleGroupObjectiveFunction
- [x] SingleTaperHoleGroupFromTopObjectiveFunction
- [x] SingleTaperSimpleRatioHemiHeadObjectiveFunction
- [x] SingleTaperNoHoleGroupingFromTopHemiHeadObjectiveFunction
- [x] SingleTaperHoleGroupFromTopHemiHeadObjectiveFunction

### 3.3 Bore Functions ✅
- [x] BorePositionObjectiveFunction
- [x] BoreSpacingFromTopObjectiveFunction
- [x] BoreFromBottomObjectiveFunction
- [x] ConicalBoreObjectiveFunction

### 3.4 Combined Functions ✅
- [x] HoleAndBoreFromBottomObjectiveFunction
- [x] HoleAndBorePositionObjectiveFunction
- [x] HoleAndBoreSpacingFromTopObjectiveFunction
- [x] HoleAndConicalBoreObjectiveFunction
- [x] HeadjointObjectiveFunction
- [x] HoleAndHeadjointObjectiveFunction

### 3.5 Calibration Functions ✅
- [x] FluteCalibrationObjectiveFunction
- [x] WhistleCalibrationObjectiveFunction
- [x] ReedCalibratorObjectiveFunction

**Parity Check:** For each function, compare optimization trajectory with Java

---

## Phase 4: Multi-Start Framework ✅ COMPLETE
**Goal:** Implement full multi-start optimization support

### 4.1 RandomRangeProcessor ✅
- [x] Port RandomRangeProcessor from Java (range-processor.ts)
- [x] Implement GridRangeProcessor for systematic grid search
- [x] Implement LatinHypercubeRangeProcessor for space-filling sampling
- [x] Add configurable number of starts (default 30)
- [x] Add createRangeProcessor factory function

### 4.2 Multi-Start Orchestration ✅
- [x] Implement multi-start loop in objective-function-optimizer.ts
- [x] Best-result tracking across starts (sort and return best)
- [x] Progress reporting for each start
- [x] Two-stage evaluator support (fast first stage, accurate refinement)

### 4.3 Vary Bore Length ✅
- [x] Implement bore length variation via indicesToVary parameter
- [x] GridRangeProcessor supports varying only specified dimensions
- [x] setStaticValues() for non-varying dimensions

### 4.4 Testing ✅
- [x] 15 tests for range processors and multi-start optimization
- [x] Tests for all three range processor strategies
- [x] Tests for "vary bore length" pattern

**Parity Check:** Multi-start results should converge to similar optima

---

## Phase 5: Two-Stage Evaluators
**Goal:** Fast initial evaluation, detailed refinement

### 5.1 First-Stage Evaluator
- [ ] Implement simplified/faster impedance calculation
- [ ] Use for initial DIRECT phase

### 5.2 Second-Stage Evaluator
- [ ] Full detailed calculation for refinement
- [ ] Switch evaluators mid-optimization

### 5.3 Integration
- [ ] Update objective functions to support evaluator switching
- [ ] Configure stage transition thresholds

**Parity Check:** Final results should match, with faster convergence

---

## Phase 6: Additional Algorithms (Lower Priority)
**Goal:** Complete algorithm coverage

### 6.1 Brent Optimizer
- [ ] Port univariate Brent optimizer
- [ ] Use for single-variable objectives (FippleFactor, etc.)

### 6.2 Other Algorithms
- [ ] CMAES (population-based)
- [ ] Simplex (Nelder-Mead)
- [ ] Powell's method

---

## Testing Strategy

### Unit Tests
- Each objective function has isolated tests
- Each optimizer algorithm has convergence tests
- Bounds handling tests

### Integration Tests
- Full optimization pipeline tests
- API endpoint tests
- Multi-start tests

### Parity Tests
- **Gold standard:** Java optimization results
- Run identical inputs through both systems
- Compare: final error, iterations, optimized values
- Acceptable variance: < 1% on final error

### Test Instruments
1. `0.875-bore_6-hole_NAF_starter.xml` - NAF baseline
2. Sample whistle instrument
3. Sample flute instrument
4. Edge cases: minimal holes, complex bore profiles

---

## Implementation Order (Recommended)

```
Week 1: Phase 1 (Wire up existing)
        - Connect sidebar to API
        - Test current functionality

Week 2: Phase 2 (BOBYQA)
        - Port algorithm
        - Integration testing

Week 3: Phase 3.1-3.2 (Objective functions - Part 1)
        - Global hole functions
        - Single taper variants

Week 4: Phase 3.3-3.4 (Objective functions - Part 2)
        - Bore functions
        - Combined functions

Week 5: Phase 4 (Multi-start)
        - RandomRangeProcessor
        - Full multi-start support

Week 6: Phase 5-6 (Polish)
        - Two-stage evaluators
        - Additional algorithms
        - Final parity testing
```

---

## Success Criteria

1. **All 54 objective functions** implemented and tested
2. **BOBYQA algorithm** working with bounded optimization
3. **Multi-start framework** with 30-start capability
4. **Parity tests pass** with < 1% variance from Java
5. **UI fully connected** to all optimization options
6. **Documentation** updated with optimization guide

---

## Files to Create/Modify

### New Files
- `src/core/optimizers/bobyqa-optimizer.ts`
- `src/core/optimizers/brent-optimizer.ts`
- `src/core/optimization/random-range-processor.ts`
- `src/core/optimization/multi-start-optimizer.ts`
- `src/core/objective/global/*.ts` (4 files)
- `src/core/objective/single-taper/*.ts` (8 files)
- Additional objective function files

### Modified Files
- `src/web/server.ts` - API endpoint updates
- `src/web/frontend.ts` - UI wiring
- `src/core/optimization/objective-function-optimizer.ts` - Algorithm dispatch
- `src/core/objective/base-objective-function.ts` - Two-stage support

---

## Notes

- Port algorithms carefully - mathematical precision matters
- Test incrementally - don't batch too many changes
- Keep Java source as reference during porting
- Document any intentional deviations from Java behavior
