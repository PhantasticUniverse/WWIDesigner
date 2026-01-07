# Java Parity Analysis

## Summary

This document summarizes the investigation into achieving exact parity between the TypeScript
implementation and the original Java WWIDesigner code.

## Test Status

- **Current average deviation**: ~21.5 cents (bore-section headspace)
- **Java expected tolerance**: ≤15 cents per note
- **Difference**: ~6.5 cents

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

## Remaining Discrepancy

Despite exact formula matches, there is a ~6.5 cents systematic offset. All predicted
frequencies are **lower** than target, suggesting something increases the effective
tube length.

Possible causes being investigated:
1. Cumulative floating point differences across many matrix multiplications
2. Component processing order differences
3. Bore diameter interpolation at hole positions
4. Transfer matrix multiplication order

## Test Files

The `java-compare/` directory contains trace files used for verification:
- `SpeedOfSoundTest.java` - Verified speed of sound formula
- `MouthpieceTrace.java` - Verified mouthpiece calculator values
- `OpenHoleTrace.java` - Verified hole calculator values
- `trace-*.ts` - TypeScript equivalents for comparison

## Next Steps

1. Investigate component ordering in calcZ()
2. Compare transfer matrix multiplication order
3. Trace full calculation chain side-by-side with Java debugger
4. Consider if the Java test actually passes at exactly 15 cents or has more margin
