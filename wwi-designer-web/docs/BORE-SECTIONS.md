# Bore Sections - Cylinder and Cone Transfer Matrices

This document details the transfer matrix equations for cylindrical and conical bore sections.

## Overview

The instrument bore is divided into sections between consecutive bore points. Each section is either:
- **Cylindrical**: Same diameter at both ends
- **Conical**: Different diameters (tapered or flared)

## Cylinder Transfer Matrix

For a lossless cylinder, the transfer matrix is:

```
     ┌                              ┐
T =  │  cos(kL)      jZ₀·sin(kL)   │
     │                              │
     │  j·sin(kL)/Z₀    cos(kL)    │
     └                              ┘
```

With losses (complex wave number), this becomes:

```
     ┌                              ┐
T =  │  cosh(γL)     Z₀·sinh(γL)   │
     │                              │
     │  sinh(γL)/Z₀    cosh(γL)    │
     └                              ┘
```

### Complex Propagation Constant

The complex propagation constant γ accounts for viscothermal losses:

```
γ = jk(1 + ε) + kε = (ε + j(1+ε)) · k
```

Where:
- `k = 2πf/c` is the wave number
- `ε = α / (r·√k)` is the loss factor
- `α` is the alpha constant from PhysicalParameters
- `r` is the bore radius

For a length L:
```
γL = (ε + j(1+ε)) · kL
```

### Implementation

```typescript
static calcCylinderMatrix(
  waveNumber: number,  // k = 2πf/c
  length: number,      // L in metres
  radius: number,      // r in metres
  params: PhysicalParameters
): TransferMatrix {
  // Characteristic impedance
  const Zc = params.calcZ0(radius);  // Z₀ = ρc/πr²

  // Loss factor
  const epsilon = params.getAlphaConstant() / (radius * Math.sqrt(waveNumber));

  // Complex propagation: γL = (ε + j(1+ε)) · kL
  const gammaL = new Complex(epsilon, 1.0 + epsilon).multiply(waveNumber * length);

  // Hyperbolic functions
  const coshL = gammaL.cosh();
  const sinhL = gammaL.sinh();

  return new TransferMatrix(
    coshL,              // T11 = cosh(γL)
    sinhL.multiply(Zc), // T12 = Z₀·sinh(γL)
    sinhL.divide(Zc),   // T21 = sinh(γL)/Z₀
    coshL               // T22 = cosh(γL)
  );
}
```

### Properties

1. **Reciprocity**: det(T) = cosh²(γL) - sinh²(γL) = 1
2. **Symmetry**: T11 = T22 (for uniform cylinder)
3. **Lossless limit** (ε→0): cosh→cos, sinh→j·sin

## Cone Transfer Matrix

For a cone (tapered section), the transfer matrix is more complex. From Lefebvre & Kergomard:

```
     ┌                                    ┐
     │  A(r_L/r_S) - B·cot(θ_in)     C    │
T =  │                                    │
     │           D                   E    │
     └                                    ┘
```

Where:
- r_S = source radius (input end)
- r_L = load radius (output end)
- L = cone length

### Geometry

```
        r_S                           r_L
         │                             │
    ─────┼─────────────────────────────┼─────
         │                             │
         │◄─────────── L ─────────────►│
```

### Mean Complex Wave Vector

The mean wave vector accounts for the varying radius:

```
if |r_L - r_S| ≈ 0:
    ε = α₀ / r_L

else:
    ε = (α₀ / (r_L - r_S)) · ln(r_L / r_S)
```

Where:
```
α₀ = α / √k
```

Mean complex wave vector:
```
k_mean = k · (1 + ε - jε)
```

### Cotangent Terms

The cone geometry introduces cotangent terms:

```
cot(θ_in) = (r_L - r_S) / (r_S · k_mean · L)

cot(θ_out) = (r_L - r_S) / (r_L · k_mean · L)
```

### Matrix Elements

```
A = cos(k_mean·L) · (r_L/r_S) - sin(k_mean·L) · cot(θ_in)

B = j · sin(k_mean·L) · Z₀(r_L) · (r_L/r_S)

C = j · (r_L/(r_S·Z₀(r_S))) · [sin(k_mean·L)·(cot(θ_out)·cot(θ_in) + 1)
                                + cos(k_mean·L)·(cot(θ_out) - cot(θ_in))]

D = cos(k_mean·L) · (r_S/r_L) + sin(k_mean·L) · cot(θ_out)
```

### Implementation

```typescript
static calcConeMatrix(
  waveNumber: number,
  length: number,
  sourceRadius: number,
  loadRadius: number,
  params: PhysicalParameters
): TransferMatrix {
  // If radii are equal, use cylinder formula
  if (sourceRadius === loadRadius) {
    return Tube.calcCylinderMatrix(waveNumber, length, sourceRadius, params);
  }

  // Mean complex wave vector (Lefebvre & Kergomard)
  const alpha_0 = params.getAlphaConstant() / Math.sqrt(waveNumber);
  let epsilon: number;

  if (Math.abs(loadRadius - sourceRadius) <= 0.00001 * sourceRadius) {
    // Limiting value as radii approach equal
    epsilon = alpha_0 / loadRadius;
  } else {
    epsilon = (alpha_0 / (loadRadius - sourceRadius)) *
              Math.log(loadRadius / sourceRadius);
  }

  const mean = new Complex(1.0 + epsilon, -epsilon);
  const kMeanL = mean.multiply(waveNumber * length);

  // Cotangents
  const cot_in = new Complex((loadRadius - sourceRadius) / sourceRadius)
                   .divide(kMeanL);
  const cot_out = new Complex((loadRadius - sourceRadius) / loadRadius)
                   .divide(kMeanL);

  // Trigonometric functions
  const sin_kL = kMeanL.sin();
  const cos_kL = kMeanL.cos();

  // Matrix elements
  const A = cos_kL.multiply(loadRadius / sourceRadius)
              .subtract(sin_kL.multiply(cot_in));

  const B = Complex.I.multiply(sin_kL)
              .multiply(params.calcZ0(loadRadius) * (loadRadius / sourceRadius));

  const C = Complex.I.multiply(loadRadius / (sourceRadius * params.calcZ0(sourceRadius)))
              .multiply(
                sin_kL.multiply(cot_out.multiply(cot_in).add(1.0))
                  .add(cos_kL.multiply(cot_out.subtract(cot_in)))
              );

  const D = cos_kL.multiply(sourceRadius / loadRadius)
              .add(sin_kL.multiply(cot_out));

  return new TransferMatrix(A, B, C, D);
}
```

## Special Cases

### Minimum Cone Length

To avoid numerical issues with very short cones:

```typescript
const MINIMUM_CONE_LENGTH = 0.00001; // 10 micrometres

if (length < MINIMUM_CONE_LENGTH) {
  kMeanL = mean.multiply(waveNumber * MINIMUM_CONE_LENGTH);
}
```

### Near-Cylindrical Cone

When source and load radii are nearly equal (|r_L - r_S| < 0.001% of r_S):
- Use limiting form of epsilon
- Or switch to cylinder formula

## Physical Interpretation

### Cylinder
- Uniform waveguide
- Wave propagates without geometric spreading
- Only viscothermal losses

### Cone (Expanding: r_L > r_S)
- Wave spreads geometrically
- Amplitude decreases as 1/r
- Effective shorter acoustic length

### Cone (Contracting: r_L < r_S)
- Wave concentrates
- Amplitude increases
- Higher velocity → higher losses

## Validation

From Java CalculationTest.java (at 440 Hz, 0.2m length, 0.01m radius):

| Quantity | Java | TypeScript | Match |
|----------|------|------------|-------|
| Cylinder Re(Z) | 0.03696 | 0.03696 | ✅ |
| Cylinder Im(Z) | -0.48516 | -0.48516 | ✅ |
| Cone Re(Z) | 0.03856 | 0.03856 | ✅ |
| Cone Im(Z) | -0.4592 | -0.4592 | ✅ |

## Bore Section Calculator

The `SimpleBoreSectionCalculator` wraps these formulas:

```typescript
class SimpleBoreSectionCalculator implements IBoreSectionCalculator {
  calcTransferMatrix(
    section: BoreSection,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix {
    const length = section.length;
    const r1 = section.leftRadius;
    const r2 = section.rightRadius;

    if (Math.abs(r1 - r2) < 1e-10) {
      return Tube.calcCylinderMatrix(waveNumber, length, r1, params);
    } else {
      return Tube.calcConeMatrix(waveNumber, length, r1, r2, params);
    }
  }
}
```

## Summary of Key Equations

| Component | Transfer Matrix Formula |
|-----------|------------------------|
| Cylinder | T = [[cosh(γL), Z₀sinh(γL)], [sinh(γL)/Z₀, cosh(γL)]] |
| Cone | T = [[A, B], [C, D]] (Lefebvre-Kergomard) |

| Quantity | Formula |
|----------|---------|
| Wave number | k = 2πf/c |
| Loss factor | ε = α/(r√k) |
| Complex prop. | γL = (ε + j(1+ε))·kL |
| Char. impedance | Z₀ = ρc/πr² |

## References

1. **Lefebvre & Kergomard** - "Propagation in weakly lossy conical tubes" - Transfer matrix formulas for cones

2. **Silva et al. (2008)** - "Approximation formulae for the acoustic radiation impedance of a cylindrical pipe" - arXiv:0811.3625v1

3. **Chaigne & Kergomard** - "Acoustics of Musical Instruments" - Chapter on waveguide theory

## Related Documentation

- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - Overall TMM theory
- [PHYSICAL-PARAMETERS.md](./PHYSICAL-PARAMETERS.md) - Air properties and α constant
- [TONE-HOLES.md](./TONE-HOLES.md) - Hole transfer matrices
