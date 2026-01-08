# Java Parity Analysis

## Summary

This document summarizes the investigation into achieving exact parity between the TypeScript
implementation and the original Java WWIDesigner code.

## Status: ✅ RESOLVED

TypeScript now achieves **exact parity** with Java predictions:

- **TypeScript average deviation from target**: 1.41 cents
- **Java average deviation from target**: 1.41 cents
- **Difference between TypeScript and Java**: 0.00 cents (identical predictions)

## Verified Calculations

The following calculations have been verified to produce **exactly identical** values
between Java and TypeScript:

### 1. Speed of Sound (Yang Yili Formula)
- **TypeScript**: 345.30996202562744 m/s at 72°F
- **Java**: 345.30996202562744 m/s at 72°F
- **Match**: ✅ Exact

### 2. Simple Physical Parameters
- Temperature, rho, gamma, eta, nu: All match exactly
- AIR_GAMMA hardcoded: 1.4018297351222222 (both)

### 3. DefaultFippleMouthpieceCalculator
Verified at 72°F, 289.42 Hz (D4 note, first fingering):
- JYE: 2.773073866839715e-6 (both)
- JYC: -1.5150934385547997e-7 (both)
- k_delta_l: 0.5646686390918869 (both)
- Transfer matrix elements: All match exactly

### 4. DefaultHoleCalculator (Open Hole)
Verified for Hole 6 at 331.14 Hz:
- tm, te, ti_base: Match exactly
- ta, ti, Rr, tr: Match exactly
- kttotal: 0.0558736913013422 (both)
- Transfer matrix elements: All match exactly

### 5. Bore Section Calculator
Both use identical Tube.calcConeMatrix formula.

### 6. Termination Calculator (ThickFlangedOpenEndCalculator)
Uses identical delta_circ and R0 formulas with same constants.

## Headspace Calculation

TypeScript now uses bore-section based headspace calculation, matching Java's
DefaultFippleMouthpieceCalculator.calcHeadspaceVolume():

```java
for (BoreSection section : mouthpiece.getHeadspace()) {
    volume += getSectionVolume(section);
}
return volume * 2.0;
```

Verified volumes for NAF instrument:
- Bore-section volume: 3.48e-6 m³
- calcHeadspaceVolume return (×2.0): 6.96e-6 m³

## Root Cause (RESOLVED)

The discrepancy was caused by **component list starting position**:

### The Bug
TypeScript's `buildComponentsInterleaved()` was starting the component list from the
**first bore point position** (e.g., -0.000762 m), but Java starts from the
**mouthpiece position** (e.g., 0.00432 m).

In Java, bore sections *before* the mouthpiece position are moved into `mouthpiece.headspace`
and **removed** from the main component list. TypeScript was incorrectly including these
sections in the main calculation loop.

### The Fix
Modified `instrument-calculator.ts`:
```typescript
// Before: Started from first bore point
let currentPosition = positions[0].position;

// After: Start from mouthpiece position (matching Java)
const mouthpiecePosition = this.instrument.mouthpiece.position;
let currentPosition = mouthpiecePosition;

// Skip positions at or before mouthpiece (those are handled in headspace)
if (item.position <= mouthpiecePosition) {
  continue;
}
```

### Impact
- Before fix: BoreSection[0] length = 0.13335 m (started at first bore point)
- After fix: BoreSection[0] length = 0.12827 m (starts at mouthpiece position)
- Difference: 0.00508 m = exactly the headspace section length

## Test Files

The `java-compare/` directory contains trace files used for verification:
- `SpeedOfSoundTest.java` - Verified speed of sound formula
- `MouthpieceTrace.java` - Verified mouthpiece calculator values
- `OpenHoleTrace.java` - Verified hole calculator values
- `ComponentTrace.java` - Compares component list structure
- `StepByStepTrace.java` - Step-by-step impedance calculation
- `compare-predictions.ts` - Full prediction comparison
- `trace-*.ts` - TypeScript equivalents for comparison

## Prediction Comparison (All 14 Notes)

| Note | Target (Hz) | TypeScript (Hz) | Java (Hz) | Deviation |
|------|-------------|-----------------|-----------|-----------|
| D4   | 289.42      | 289.40         | 289.40    | -0.13     |
| F4   | 331.14      | 330.98         | 330.98    | -0.85     |
| F#4  | 342.49      | 342.25         | 342.25    | -1.23     |
| G4   | 366.98      | 366.72         | 366.72    | -1.24     |
| G#4  | 394.16      | 393.90         | 393.90    | -1.16     |
| A4   | 413.40      | 413.13         | 413.13    | -1.14     |
| A#4  | 422.39      | 421.88         | 421.88    | -2.09     |
| B4   | 455.79      | 455.35         | 455.35    | -1.67     |
| C5   | 469.19      | 468.65         | 468.65    | -2.01     |
| C#5  | 500.58      | 499.98         | 499.98    | -2.09     |
| D5   | 521.92      | 521.13         | 521.13    | -2.61     |
| D#5  | 549.33      | 548.53         | 548.53    | -2.53     |
| E5   | 634.86      | 634.71         | 634.71    | -0.40     |
| F5   | 663.83      | 663.61         | 663.61    | -0.58     |

**Average |deviation|: 1.41 cents (identical for both implementations)**
