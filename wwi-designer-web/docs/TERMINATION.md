# Termination - Radiation Impedance

This document details the equations used to model the open end (termination) of wind instruments, including radiation impedance and end corrections.

## Overview

The termination (open end) of a tube has a complex radiation impedance that depends on:
- Tube radius
- Frequency
- Flange geometry (unflanged, flanged, or thick flanged)

The radiation impedance determines:
- How much acoustic energy escapes vs. reflects back
- The effective acoustic length of the tube (end correction)

## State Vector at Termination

For an **open end**, the state vector is:
```
sv = [P, U] = [Z_rad, 1]
```
(normalized to unit volume velocity)

For a **closed end**:
```
sv = [P, U] = [1, 0]
```
(infinite impedance, no flow)

## Unflanged End (Bare Pipe)

For a pipe with no flange (thin wall, open to free space). From Silva et al., 2008.

### Impedance Formula

```
Z_unflanged = Z₀ · (R_real + j·X_imag) / D
```

Where:
- `ka = k·a` (wave number × radius)
- `D = 1 + (ka)²·(0.1514 + 0.05221·(ka)²)`
- `R_real = (ka)²·(0.2499 + 0.05221·(ka)²)`
- `X_imag = ka·(0.6133 + 0.0381·(ka)²)`

### Implementation

```typescript
static calcZload(freq: number, radius: number, params: PhysicalParameters): Complex {
  const ka = params.calcWaveNumber(freq) * radius;
  const ka2 = ka * ka;
  const z0_denominator = params.calcZ0(radius) / (1.0 + ka2 * (0.1514 + 0.05221 * ka2));

  return new Complex(
    ka2 * (0.2499 + 0.05221 * ka2) * z0_denominator,  // Real part
    ka * (0.6133 + 0.0381 * ka2) * z0_denominator     // Imag part
  );
}
```

### End Correction

For low frequencies (ka << 1), the end correction is approximately:
```
δ_unflanged ≈ 0.6133·a
```

---

## Flanged End (Infinite Flange)

For a pipe mounted in an infinite rigid baffle. From Silva et al., 2008.

### Impedance Formula

```
Z_flanged = Z₀ · (R_real + j·X_imag) / D
```

Where:
- `D = 1 + (ka)²·(0.358 + 0.1053·(ka)²)`
- `R_real = (ka)²·(0.5 + 0.1053·(ka)²)`
- `X_imag = ka·(0.82159 + 0.059·(ka)²)`

### Implementation

```typescript
static calcZflanged(freq: number, radius: number, params: PhysicalParameters): Complex {
  const ka = params.calcWaveNumber(freq) * radius;
  const ka2 = ka * ka;
  const z0_denominator = params.calcZ0(radius) / (1.0 + ka2 * (0.358 + 0.1053 * ka2));

  return new Complex(
    ka2 * (0.5 + 0.1053 * ka2) * z0_denominator,      // Real part
    ka * (0.82159 + 0.059 * ka2) * z0_denominator     // Imag part
  );
}
```

### End Correction

For low frequencies:
```
δ_flanged ≈ 0.82159·a
```

### Alternative Formula (Kergomard et al., 2015)

A more accurate formulation:

```
Z_flanged = Z₀ · N / D
```

Where:
- `N = 0.3216·(ka)² + j·(0.82159 - 0.0368·(ka)²)·ka`
- `D = (1 + 0.3701·(ka)²) + j·(1 - 0.0368·(ka)²)·ka`

```typescript
static calcZflangedKergomard(freq: number, radius: number, params: PhysicalParameters): Complex {
  const ka = params.calcWaveNumber(freq) * radius;
  const ka2 = ka * ka;
  const numerator = new Complex(0.3216 * ka2, (0.82159 - 0.0368 * ka2) * ka);
  const denominator = new Complex(1 + 0.3701 * ka2, (1.0 - 0.0368 * ka2) * ka);
  return numerator.divide(denominator).multiply(params.calcZ0(radius));
}
```

---

## Thick Flanged End (NAF Calculator)

For thick-walled wooden tubes with finite flange. Used by NAFCalculator.

This model interpolates between unflanged and infinite-flanged cases based on the bore-to-flange diameter ratio.

### Constants

```typescript
const DELTA_INF = 0.8216;  // End correction for infinite flange (≈ 0.82159 from Silva)
const DELTA_0 = 0.6133;    // End correction for unflanged
```

**Note**: The constant `DELTA_INF = 0.8216` is a truncated form of `0.82159` from Silva et al. (2008). Both values appear in the literature; the Java/TypeScript implementation uses `0.8216` for the thick-flanged interpolation while `0.82159` is used in the exact flanged radiation formulas. The difference (0.01%) is negligible for practical calculations.

### Geometry

```
        ◄─── 2b ───►
   ─────┬─────────────┬─────
        │             │
        │    ┌───┐    │      Flange
        │    │   │    │
   ─────┼────┼───┼────┼─────
        │    │ ↑ │    │
        │    │ a │    │      Bore
        │    │ ↓ │    │
   ─────┼────┼───┼────┼─────
        │    │   │    │
        │    └───┘    │
        │             │
   ─────┴─────────────┴─────
```

Where:
- `a` = bore radius
- `b` = flange radius
- `a/b` = bore-to-flange ratio (0 = infinite flange, 1 = unflanged)

### End Correction (δ_circ)

Interpolation formula:
```
δ_circ = δ_∞ + (a/b)·(δ_0 - δ_∞) + 0.057·(a/b)·(1 - (a/b)⁵)
```

Where:
- `δ_∞ = 0.8216` (infinite flange)
- `δ_0 = 0.6133` (unflanged)

The third term is an empirical correction for intermediate flange sizes.

### Reflection Coefficient Magnitude

Frequency-dependent magnitude:
```
R₀ = (1 + 0.2·ka - 0.084·(ka)²) / (1 + 0.2·ka + (0.5 - 0.084)·(ka)²)
```

At low frequencies: R₀ → 1 (perfect reflection)
At high frequencies: R₀ → 0 (transmission/radiation)

### Complex Reflection Coefficient

```
R = -R₀ · exp(-2j·δ_circ·ka)
```

The phase term represents the round-trip phase shift for the reflected wave.

### Impedance from Reflection Coefficient

Converting reflection coefficient to impedance:
```
Z/Z₀ = (1 + R) / (1 - R)
```

### Implementation

```typescript
class ThickFlangedOpenEndCalculator {
  private static readonly DELTA_INF = 0.8216;
  private static readonly DELTA_0 = 0.6133;

  calcStateVector(termination, isOpen, waveNumber, params): StateVector {
    if (!isOpen) {
      return StateVector.ClosedEnd();
    }

    const Z = this.calcZ(termination, waveNumber, params)
      .multiply(params.calcZ0(termination.boreDiameter / 2));

    return new StateVector(Z);
  }

  private calcZ(termination, waveNumber, params): Complex {
    const a = termination.boreDiameter / 2;  // Bore radius
    const b = termination.flangeDiameter / 2; // Flange radius

    const a_b = a / b;
    const ka = waveNumber * a;

    // End correction interpolation
    const delta_circ = DELTA_INF + a_b * (DELTA_0 - DELTA_INF) +
                       0.057 * a_b * (1 - Math.pow(a_b, 5));

    // Reflection coefficient magnitude
    const R0 = (1 + 0.2 * ka - 0.084 * ka * ka) /
               (1 + 0.2 * ka + (0.5 - 0.084) * ka * ka);

    // Complex reflection coefficient
    const phaseAngle = -2 * delta_circ * ka;
    const R = new Complex(0, phaseAngle).exp().multiply(-R0);

    // Convert to impedance: Z = (1 + R) / (1 - R)
    return R.add(1).divide(R.negate().add(1));
  }
}
```

---

## Calculator Selection

The default calculator selection logic:

```typescript
function getTerminationCalculator(termination: Termination): ITerminationCalculator {
  const boreDiameter = termination.boreDiameter ?? 0.01;

  // If flange diameter > 110% of bore, use flanged calculator
  if (termination.flangeDiameter > boreDiameter * 1.1) {
    return flangedEndCalculator;
  }

  return unflangedEndCalculator;
}
```

For NAF instruments, explicitly use `thickFlangedEndCalculator`:

```typescript
const nafCalc = new DefaultInstrumentCalculator(
  instrument,
  params,
  defaultFippleCalculator,
  thickFlangedEndCalculator,  // ← ThickFlangedOpenEndCalculator
  new DefaultHoleCalculator(0.9605),
  new SimpleBoreSectionCalculator()
);
```

---

## Radiation Resistance

The radiation resistance (real part of radiation impedance) represents acoustic power radiated:

### Unflanged (Silva 2008)

```
R_rad = Z₀ · (ka)² · (0.2499 + 0.05221·(ka)²) / (1 + (ka)²·(0.1514 + 0.05221·(ka)²))
```

### Flanged (Silva 2008)

```
R_rad = Z₀ · (ka)² · (0.5 + 0.1053·(ka)²) / (1 + (ka)²·(0.358 + 0.1053·(ka)²))
```

The flanged case has approximately 2× higher radiation resistance (better radiator).

---

## Summary of End Corrections

| Termination Type | End Correction δ/a | Use Case |
|-----------------|-------------------|----------|
| Unflanged | 0.6133 | Thin-walled metal tubes |
| Flanged (infinite) | 0.8216 | Embedded in baffle |
| Thick flanged | 0.6133 to 0.8216 | Wooden tubes with walls |

## Validation

From Java CalculationTest.java (at 440 Hz, 10mm radius):

| Quantity | Java | TypeScript | Match |
|----------|------|------------|-------|
| Unflanged Re(Z) | 0.00101768 | 0.00101768 | ✅ |
| Unflanged Im(Z) | 0.039132 | 0.039132 | ✅ |

---

## References

1. **Silva, F., et al. (2008)** - "Approximation formulae for the acoustic radiation impedance of a cylindrical pipe", arXiv:0811.3625v1

2. **Kergomard, J., et al. (2015)** - "Radiation impedance of tubes with different flanges"

3. **Levine & Schwinger (1948)** - Original unflanged pipe radiation theory

4. **Norris & Sheng (1989)** - End correction for flanged circular pipes

## Related Documentation

- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - TMM theory
- [BORE-SECTIONS.md](./BORE-SECTIONS.md) - Bore propagation
- [MOUTHPIECES.md](./MOUTHPIECES.md) - Excitation calculations
