# Spectrum Analysis

This document details the spectrum analysis classes for impedance and reflectance calculations.

## Overview

Spectrum analysis classes calculate and store frequency-domain data for wind instrument acoustics. They are used to:
- Visualize instrument impedance/reflectance curves
- Find resonance frequencies (minima/maxima)
- Analyze playing characteristics across frequency ranges

## Impedance Spectrum

The `ImpedanceSpectrum` class calculates and stores impedance data across a frequency range, identifying local minima and maxima.

### Reference

Ported from `com.wwidesigner.modelling.ImpedanceSpectrum`

### Usage

```typescript
import {
  ImpedanceSpectrum,
  calculateImpedanceSpectrum
} from "./modelling/spectrum.ts";

// Method 1: Direct instantiation
const spectrum = new ImpedanceSpectrum();
spectrum.calcImpedance(calculator, 200, 2000, 1000, fingering);

// Method 2: Factory function
const spectrum = calculateImpedanceSpectrum(
  calculator,
  fingering,
  200,    // freqStart (Hz)
  2000,   // freqEnd (Hz)
  1000    // number of frequency points
);

// Access results
const minima = spectrum.getMinima();      // Frequencies of |Im(Z)| minima
const maxima = spectrum.getMaxima();      // Frequencies of |Im(Z)| maxima
const points = spectrum.getSpectrumPoints(); // All data points
```

### How It Works

The impedance spectrum identifies extrema based on the **imaginary part** of impedance:

```
For each frequency f in [freqStart, freqEnd]:
  1. Calculate Z = calculator.calcZ(f, fingering)
  2. Use |Im(Z)| as the comparison value
  3. If previous |Im(Z)| < current AND previous |Im(Z)| < previous-previous:
     → Found a minimum (resonance)
  4. If previous |Im(Z)| > current AND previous |Im(Z)| > previous-previous:
     → Found a maximum (anti-resonance)
```

### Key Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `calcImpedance()` | void | Calculate spectrum over frequency range |
| `getMinima()` | `number[]` | Frequencies of impedance minima |
| `getMaxima()` | `number[]` | Frequencies of impedance maxima |
| `getSpectrum()` | `Map<number, Complex>` | Raw spectrum data |
| `getSpectrumPoints()` | `SpectrumPoint[]` | Sorted array of points |
| `getClosestMinimumFrequency(f)` | `number \| null` | Minimum nearest to target |
| `getClosestMaximumFrequency(f)` | `number \| null` | Maximum nearest to target |

### Physical Interpretation

- **Minima of |Im(Z)|**: These occur where the imaginary part of impedance crosses zero, indicating resonances for flow-node instruments (flutes, whistles)
- **Maxima of |Im(Z)|**: Anti-resonances where the instrument strongly resists oscillation

## Reflectance Spectrum

The `ReflectanceSpectrum` class calculates reflection coefficient data, tracking both angle and magnitude extrema.

### Reference

Ported from `com.wwidesigner.modelling.ReflectanceSpectrum`

### Usage

```typescript
import {
  ReflectanceSpectrum,
  calculateReflectanceSpectrum,
  ReflectancePlotType
} from "./modelling/spectrum.ts";

// Calculate spectrum
const spectrum = calculateReflectanceSpectrum(
  calculator,
  fingering,
  200,    // freqStart
  2000,   // freqEnd
  1000    // nfreq
);

// Access results
const angleMinima = spectrum.getMinima();         // Squared angle minima
const angleMaxima = spectrum.getMaxima();         // Squared angle maxima
const magMinima = spectrum.getMagnitudeMinima();  // Magnitude minima
```

### How It Works

The reflectance spectrum tracks two quantities:

1. **Squared Reflectance Angle** (arg(R)²):
   - Minima indicate phase transitions
   - Used for resonance identification

2. **Reflectance Magnitude** (|R|):
   - Minima indicate frequencies where most energy enters the instrument
   - Values close to 0 = good coupling, close to 1 = strong reflection

```
For each frequency f:
  1. R = calculator.calcReflectionCoefficient(f, fingering)
  2. angle² = arg(R)²
  3. magnitude = |R|
  4. Track local extrema for both
```

### Key Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `calcReflectance()` | void | Calculate spectrum over frequency range |
| `getMinima()` | `number[]` | Frequencies of squared angle minima |
| `getMaxima()` | `number[]` | Frequencies of squared angle maxima |
| `getMagnitudeMinima()` | `number[]` | Frequencies of magnitude minima |
| `getSpectrum()` | `Map<number, Complex>` | Raw spectrum data |
| `getCurrentFingering()` | `Fingering \| null` | Fingering used for calculation |

### Plot Types

```typescript
enum ReflectancePlotType {
  PLOT_SQ_REFL_ANGLE_AND_MAGNITUDE = 0,  // Both angle² and |R|
  PLOT_SQ_REFL_ANGLE_ONLY = 1,           // Only angle²
  PLOT_REFL_MAGNITUDE_ONLY = 2,          // Only |R|
}
```

## Data Structures

### SpectrumPoint

```typescript
interface SpectrumPoint {
  frequency: number;  // Frequency in Hz
  value: Complex;     // Complex impedance or reflectance
}
```

## Example: Finding Resonances

```typescript
import { calculateImpedanceSpectrum } from "./modelling/spectrum.ts";
import { createNAFCalculator } from "./modelling/calculator-factory.ts";

// Set up calculator
const calculator = createNAFCalculator(instrument, params);

// Calculate spectrum for all-holes-closed fingering
const closedFingering = tuning.fingering[0];
const spectrum = calculateImpedanceSpectrum(
  calculator,
  closedFingering,
  200,   // 200 Hz
  2000,  // 2000 Hz
  500    // 500 points
);

// Find resonances
const resonances = spectrum.getMinima();
console.log("Resonance frequencies:", resonances);

// Find resonance closest to target note (e.g., 440 Hz)
const closestResonance = spectrum.getClosestMinimumFrequency(440);
console.log("Closest resonance to A4:", closestResonance);
```

## Example: Comparing Impedance and Reflectance

```typescript
import {
  calculateImpedanceSpectrum,
  calculateReflectanceSpectrum
} from "./modelling/spectrum.ts";

// Calculate both spectra
const impSpectrum = calculateImpedanceSpectrum(calculator, fingering);
const refSpectrum = calculateReflectanceSpectrum(calculator, fingering);

// Compare minima
console.log("Impedance minima:", impSpectrum.getMinima());
console.log("Reflectance angle minima:", refSpectrum.getMinima());
console.log("Reflectance magnitude minima:", refSpectrum.getMagnitudeMinima());

// They should identify similar resonance frequencies
```

## Performance Considerations

- **Frequency Resolution**: More points give better accuracy but slower computation
  - Typical: 500-1000 points for visualization
  - High precision: 2000+ points for optimization

- **Frequency Range**:
  - Standard flutes: 200-2000 Hz covers fundamental + several harmonics
  - Low instruments: Start from 50-100 Hz
  - High instruments: Extend to 4000+ Hz

- **Memory**: Each spectrum stores O(nfreq) complex values

## Relationship to Other Components

```
┌─────────────────────────────────────────────────────────┐
│                  Spectrum Analysis                       │
│  ImpedanceSpectrum / ReflectanceSpectrum                │
└─────────────────────────────────────────────────────────┘
                          │
                          │ uses
                          ▼
┌─────────────────────────────────────────────────────────┐
│              InstrumentCalculator                        │
│  calcZ() / calcReflectionCoefficient()                  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ uses
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  PlayingRange                            │
│  Uses spectrum minima/maxima for resonance finding      │
└─────────────────────────────────────────────────────────┘
                          │
                          │ uses
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 InstrumentTuner                          │
│  Predicts playing frequencies from resonances           │
└─────────────────────────────────────────────────────────┘
```

## Java Parity

Both classes achieve exact parity with the original Java implementation:

| Java Class | TypeScript Class | Status |
|------------|------------------|--------|
| `ImpedanceSpectrum` | `ImpedanceSpectrum` | ✅ Complete |
| `ReflectanceSpectrum` | `ReflectanceSpectrum` | ✅ Complete |

Key implementation notes:
- Uses `|Im(Z)|` for impedance extrema detection (matching Java)
- Squared reflectance angle for phase tracking
- All extrema detection uses 3-point local comparison

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview
- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - Core acoustic theory
- [OPTIMIZATION.md](./OPTIMIZATION.md) - Using spectra in optimization
