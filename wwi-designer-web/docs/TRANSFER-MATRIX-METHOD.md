# Transfer Matrix Method (TMM)

The Transfer Matrix Method is the mathematical foundation of the acoustic modeling system. This document explains the theory and implementation in detail.

## Overview

The TMM models acoustic wave propagation by representing each physical component as a 2×2 complex matrix that relates the acoustic state at one end to the state at the other end.

## State Vector

The acoustic state at any point is described by a **state vector**:

```
     ┌   ┐
sv = │ P │
     │ U │
     └   ┘
```

Where:
- **P** = Complex acoustic pressure (Pa)
- **U** = Complex volume velocity (m³/s)

### Implementation

```typescript
// src/core/math/state-vector.ts
class StateVector {
  constructor(
    public p: Complex,  // Pressure
    public u: Complex   // Volume velocity
  ) {}

  // Impedance: Z = P / U
  getImpedance(): Complex {
    return this.p.div(this.u);
  }

  // Reflection coefficient: R = (Z - Z0) / (Z + Z0)
  getReflectance(z0: number): Complex {
    const z = this.getImpedance();
    return z.sub(z0).div(z.add(z0));
  }
}
```

## Transfer Matrix

A **transfer matrix** relates input and output state vectors:

```
┌      ┐   ┌         ┐ ┌     ┐
│ Pout │   │ T11 T12 │ │ Pin │
│      │ = │         │ │     │
│ Uout │   │ T21 T22 │ │ Uin │
└      ┘   └         ┘ └     ┘
```

Or in compact notation:

```
sv_out = T · sv_in
```

### Matrix Elements

| Element | Physical Meaning |
|---------|-----------------|
| T11 (PP) | Pressure → Pressure transfer |
| T12 (PU) | Volume velocity → Pressure transfer |
| T21 (UP) | Pressure → Volume velocity transfer |
| T22 (UU) | Volume velocity → Volume velocity transfer |

### Key Property: Reciprocity

For passive acoustic elements:

```
det(T) = T11·T22 - T12·T21 = 1
```

This is verified in tests to ensure numerical accuracy.

### Implementation

```typescript
// src/core/math/transfer-matrix.ts
class TransferMatrix {
  constructor(
    public pp: Complex,  // T11
    public pu: Complex,  // T12
    public up: Complex,  // T21
    public uu: Complex   // T22
  ) {}

  // Multiply by state vector
  multiply(sv: StateVector): StateVector {
    return new StateVector(
      this.pp.mul(sv.p).add(this.pu.mul(sv.u)),
      this.up.mul(sv.p).add(this.uu.mul(sv.u))
    );
  }

  // Multiply two transfer matrices
  multiplyMatrix(other: TransferMatrix): TransferMatrix {
    return new TransferMatrix(
      this.pp.mul(other.pp).add(this.pu.mul(other.up)),
      this.pp.mul(other.pu).add(this.pu.mul(other.uu)),
      this.up.mul(other.pp).add(this.uu.mul(other.up)),
      this.up.mul(other.pu).add(this.uu.mul(other.uu))
    );
  }
}
```

## Cascading Components

When multiple components are in series, their transfer matrices multiply:

```
sv_final = T_n · T_{n-1} · ... · T_2 · T_1 · sv_initial
```

**Important**: Matrices multiply right-to-left (from termination toward mouthpiece).

### Calculation Order

```
     Mouthpiece                                    Termination
        │                                              │
        ▼                                              ▼
   ┌─────────┐     ┌─────────┐     ┌─────────┐    ┌────────┐
   │ Bore 1  │ ──▶ │ Hole 1  │ ──▶ │ Bore 2  │ ──▶│  End   │
   └─────────┘     └─────────┘     └─────────┘    └────────┘
        │              │              │               │
       T_3            T_2            T_1            sv_0
                                                      │
   sv_final ◀──────────────────────────────────────── │
```

1. Start with state vector at termination: `sv_0`
2. Apply each transfer matrix working backward: `sv = T_i · sv`
3. Final state vector gives impedance at mouthpiece

## Impedance Calculation

The input impedance is:

```
Z_in = P_in / U_in
```

For flow-node mouthpieces (fipple, embouchure), resonance occurs when:

```
Im(Z_in) = 0   (imaginary part crosses zero)
```

### Full Algorithm

```typescript
function calcZ(freq: number, fingering: Fingering): Complex {
  // 1. Calculate wave number
  const k = params.calcWaveNumber(freq);  // k = 2πf/c

  // 2. Get initial state at termination
  let sv = termination.calcStateVector(instrument.termination, k, params);

  // 3. Walk backward through all components
  for (let i = components.length - 1; i >= 0; i--) {
    const comp = components[i];
    if (comp.type === "bore") {
      sv = boreCalculator.calcTransferMatrix(comp.section, k, params).multiply(sv);
    } else if (comp.type === "hole") {
      const isOpen = fingering.openHole[holeIndex];
      sv = holeCalculator.calcTransferMatrix(comp.hole, isOpen, k, params).multiply(sv);
    }
  }

  // 4. Apply mouthpiece effect
  sv = mouthpiece.calcStateVector(mouthpiece, sv, k, params);

  // 5. Return impedance
  return sv.getImpedance();
}
```

## Complex Wave Number

Wave propagation includes viscothermal losses modeled by a complex wave number:

```
k_complex = k · (1 + ε - jε)
```

Where:
- `k = 2πf/c` is the real wave number
- `ε = α / (r · √k)` is the loss factor
- `α` is the alpha constant from PhysicalParameters
- `r` is the bore radius
- `j = √(-1)` is the imaginary unit

This gives:
- **Real part**: `k(1 + ε)` - slightly increased wave number (slower apparent speed)
- **Imaginary part**: `-kε` - exponential decay (losses)

### Implementation

```typescript
// Calculate complex wave number
function calcComplexWaveNumber(
  waveNumber: number,  // k = 2πf/c
  radius: number,      // bore radius
  alpha: number        // loss constant
): Complex {
  const epsilon = alpha / (radius * Math.sqrt(waveNumber));
  return new Complex(
    waveNumber * (1 + epsilon),  // Real part
    -waveNumber * epsilon        // Imaginary part (negative = decay)
  );
}
```

## Reflection Coefficient

The reflection coefficient relates reflected to incident waves:

```
R = (Z - Z_0) / (Z + Z_0)
```

Where `Z_0 = ρc / (πr²)` is the characteristic impedance.

Physical interpretation:
- `|R| = 1`: Total reflection (closed end)
- `|R| = 0`: No reflection (perfectly matched)
- `R = -1`: Phase inversion (resonance for flow-node mouthpiece)

### Implementation

```typescript
getReflectance(z0: number): Complex {
  const z = this.getImpedance();
  const num = z.sub(new Complex(z0, 0));
  const den = z.add(new Complex(z0, 0));
  return num.div(den);
}
```

## Characteristic Impedance

The characteristic impedance of a cylindrical tube:

```
Z_0 = ρc / S = ρc / (πr²)
```

Where:
- `ρ` = air density (kg/m³)
- `c` = speed of sound (m/s)
- `S` = cross-sectional area (m²)
- `r` = radius (m)

### Implementation

```typescript
// In PhysicalParameters
calcZ0(radius: number): number {
  return this.getRho() * this.getC() / (Math.PI * radius * radius);
}
```

## Loop Gain

The loop gain determines whether oscillation is sustainable (Auvray 2012):

```
G = G_0 · f · ρ / |Z|
```

Where:
- `G_0` = mouthpiece gain factor (from geometry)
- `f` = frequency (Hz)
- `ρ` = air density (kg/m³)
- `|Z|` = impedance magnitude

Interpretation:
- `G > 1`: Sound grows (attack)
- `G = 1`: Steady state
- `G < 1`: Sound decays

### For Fipple Mouthpiece

```
G_0 = 0.4 · A_f · h_f / (ρ · c² · H · W)
```

Where:
- `A_f` = fipple factor (empirical, ~0.7)
- `h_f` = fipple factor constant
- `H` = windway height
- `W` = window width

## Summary of Key Equations

| Quantity | Equation | Units |
|----------|----------|-------|
| Wave number | `k = 2πf/c` | rad/m |
| Complex wave number | `k_c = k(1+ε-jε)` | rad/m |
| Loss factor | `ε = α/(r√k)` | dimensionless |
| Impedance | `Z = P/U` | Pa·s/m³ |
| Characteristic impedance | `Z_0 = ρc/πr²` | Pa·s/m³ |
| Reflection coefficient | `R = (Z-Z_0)/(Z+Z_0)` | dimensionless |
| Transfer matrix | `[P_o, U_o]ᵀ = T·[P_i, U_i]ᵀ` | - |
| Loop gain | `G = G_0·f·ρ/|Z|` | dimensionless |

## References

1. **Lefebvre & Kergomard (2013)** - Transfer matrix formalism for wind instruments
2. **Fletcher & Rossing** - "The Physics of Musical Instruments" - General acoustics
3. **Auvray (2012)** - Physical modeling and gain calculations for flute-like instruments
4. **Chaigne & Kergomard** - "Acoustics of Musical Instruments" - Comprehensive reference

## Related Documentation

- [BORE-SECTIONS.md](./BORE-SECTIONS.md) - Cylinder and cone transfer matrices
- [TONE-HOLES.md](./TONE-HOLES.md) - Hole transfer matrices
- [MOUTHPIECES.md](./MOUTHPIECES.md) - Mouthpiece calculations
- [TERMINATION.md](./TERMINATION.md) - Radiation impedance
