# Acoustic Theory Skill

## Overview

This skill provides knowledge of woodwind acoustic modeling using the Transfer Matrix Method (TMM).

## Transfer Matrix Method (TMM)

The core of acoustic modeling. Sound propagation through an instrument is modeled as:

```
[P_out]   [T11  T12] [P_in]
[U_out] = [T21  T22] [U_in]
```

Where:
- P = Pressure (complex)
- U = Volume velocity (complex)
- T = 2×2 transfer matrix (complex)

Each component (bore section, hole, mouthpiece, termination) has its own transfer matrix. The total instrument transfer matrix is the product of all component matrices.

### Resonance Finding

Resonances (playable notes) occur where the imaginary part of input impedance crosses zero:
```
Z = P/U at mouthpiece
Resonance when Im(Z) = 0
```

## Key Files

### Math Foundation
- `src/core/math/complex.ts` - Complex number operations (immutable + in-place)
- `src/core/math/transfer-matrix.ts` - 2×2 complex matrix with multiply
- `src/core/math/state-vector.ts` - [P, U] state representation

### Physics
- `src/core/physics/physical-parameters.ts` - Air properties (CIPM-2007 standard)
  - Speed of sound: `calcSpeedOfSound(temp, humidity)`
  - Air density: `calcAirDensity(temp, humidity, pressure)`
  - Characteristic impedance: `calcZ0(temp, humidity)`

### Geometry Components
- `src/core/geometry/tube.ts` - Cylinder/cone wave propagation
- `src/core/geometry/bore-section-calculator.ts` - Bore segments
- `src/core/geometry/hole-calculator.ts` - Tone hole acoustics (Dalmont model)
- `src/core/geometry/mouthpiece-calculator.ts` - Fipple, embouchure, reed
- `src/core/geometry/termination-calculator.ts` - Radiation impedance

### Instrument Calculation
- `src/core/modelling/instrument-calculator.ts` - Main impedance calculation
- `src/core/modelling/playing-range.ts` - Find resonance frequencies
- `src/core/modelling/instrument-tuner.ts` - Calculate tuning (cents deviation)

## Instrument Types

| Type | Calculator | Model Characteristics |
|------|------------|----------------------|
| NAF | `NAFCalculator` | Fipple mouthpiece, thick walls, unflanged termination |
| Whistle | `WhistleCalculator` | Fipple, thin walls |
| Flute | `FluteCalculator` | Embouchure hole, transverse blowing |

## Performance Tips

### Complex Number Operations

Hot paths create many intermediate `Complex` objects. Use in-place operations:

```typescript
// Slow (allocates intermediates):
result = a.multiply(b).add(c.multiply(d));

// Fast (in-place, reuses objects):
result = a.copy().multiplyInPlace(b).addInPlace(c.copy().multiplyInPlace(d));
```

### TransferMatrix Operations

Use scratch matrices for hot loops:

```typescript
const scratch = new TransferMatrix();
for (const section of boreSections) {
    totalMatrix.multiplyInPlace(section.calcMatrix(freq, scratch));
}
```

## Documentation

See `wwi-designer-web/docs/` for detailed theory:
- `TRANSFER-MATRIX-METHOD.md` - Core TMM theory
- `PHYSICAL-PARAMETERS.md` - Air properties derivation
- `BORE-SECTIONS.md` - Cylinder/cone propagation
- `TONE-HOLES.md` - Dalmont tone hole model
- `MOUTHPIECES.md` - Fipple/embouchure/reed models
- `TERMINATION.md` - Radiation impedance

## Key Constants

From `src/core/constants.ts`:

```typescript
SPEED_OF_SOUND_REF = 347.23    // m/s at 25°C, 50% RH
AIR_DENSITY_REF = 1.1644       // kg/m³ at 25°C, 50% RH, 101325 Pa
CENTS_PER_OCTAVE = 1200
SEMITONES_PER_OCTAVE = 12
```

## Numerical Precision

The TypeScript implementation achieves **exact parity with Java WWIDesigner**:
- Verified to 15+ significant digits
- NAF D Minor: 1.41 cents average deviation (identical to Java)
