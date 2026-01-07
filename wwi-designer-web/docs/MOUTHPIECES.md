# Mouthpieces - Acoustic Models

This document details the equations used to model different mouthpiece types in woodwind instruments.

## Overview

Mouthpieces are categorized by their acoustic excitation mechanism:

| Type | Driving Mechanism | Examples |
|------|-------------------|----------|
| **Flow-node** | Air jet across opening | Flutes, recorders, NAFs, whistles |
| **Pressure-node** | Reed vibration | Clarinets, saxophones, oboes |

For flow-node mouthpieces, resonance occurs when Im(Z) = 0.
For pressure-node mouthpieces, resonance occurs when Im(Z₀/Z) = 0.

## Mouthpiece Calculator Interface

```typescript
interface IMouthpieceCalculator {
  // Calculate state vector as seen by driving source
  calcStateVector(
    boreState: StateVector,
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): StateVector;

  // Calculate transfer matrix for mouthpiece effect
  calcTransferMatrix(
    mouthpiece: Mouthpiece,
    waveNumber: number,
    params: PhysicalParameters
  ): TransferMatrix;
}
```

## Headspace

The **headspace** is the bore volume between the first bore point and the mouthpiece position. It acts as an acoustic compliance in parallel with the main bore.

```
        ◄──── Headspace ────►
   ┌────────────────────────────────┬──────────────────────
   │  Closed                        │
   │  End                           │  Main Bore →
   │                                │
   └────────────────────────────────┴──────────────────────
   ▲                                ▲
   First bore point                 Mouthpiece position
```

### Headspace Volume

For a series of conical sections:

```
V_section = (π·L/3) · (r_left² + r_left·r_right + r_right²)

V_total = Σ V_section
```

### Headspace State Vector

Treating headspace as a duct with closed upper end:

```typescript
let headspaceState = StateVector.ClosedEnd();  // [1, 0]

for (const section of headspace) {
  const tm = Tube.calcConeMatrix(waveNumber, section.length,
                                  section.rightRadius, section.leftRadius, params);
  headspaceState = headspaceState.applyTransferMatrix(tm);
}
```

The headspace state is combined with the bore state in parallel:
```
sv_combined = sv_bore.parallel(sv_headspace)
```

---

## Simple Fipple Calculator

Used for: **Whistles** (tin whistle, penny whistle)

Models the window as a short tube with flanged open end.

### Transfer Matrix

```
     ┌               ┐
T =  │  1    Z_w     │
     │  0     1      │
     └               ┘
```

Where Z_w is the window impedance.

### Window Impedance

```
Z_w = R_w + j·X_w
```

**Reactance** (empirical model):
```
X_w = (ρ·f / s_eff) · (4.3 + 2.87·h_w/s_eff)
```

Where:
- `s_eff = √(L_w · W_w)` = effective window size
- `L_w` = window length
- `W_w` = window width
- `h_w` = window height (or windway height)
- `ρ` = air density
- `f` = frequency

**Resistance** (radiation + tube losses):
```
R_w = R_rad + (ρ · 0.0184 · √f · h_w) / s_eff³
```

Where:
```
R_rad = Z₀ · (ka)² · (0.5 + 0.1053·(ka)²) / (1 + (ka)²·(0.358 + 0.1053·(ka)²))
```

### Implementation

```typescript
class SimpleFippleMouthpieceCalculator {
  calcZ(mouthpiece: Mouthpiece, freq: number, params: PhysicalParameters): Complex {
    const effSize = Math.sqrt(fipple.windowLength * fipple.windowWidth);
    const windowHeight = fipple.windowHeight ?? fipple.windwayHeight ?? 0.001;

    const Xw = (params.getRho() * freq) / effSize * (4.3 + 2.87 * windowHeight / effSize);

    const radius = 0.5 * mouthpiece.boreDiameter;
    const Rw = Tube.calcR(freq, radius, params) +
               (params.getRho() * 0.0184 * Math.sqrt(freq) * windowHeight) /
               (effSize * effSize * effSize);

    return new Complex(Rw, Xw);
  }
}
```

---

## Default Fipple Calculator (NAF)

Used for: **Native American Flutes**

This is a more sophisticated model using admittance-based calculations with scaled fipple factor.

### Transfer Matrix

```
     ┌                                      ┐
T =  │  cos(kΔL) + jR·sin(kΔL)/Z₀    R·cos(kΔL) + jZ₀·sin(kΔL)  │
     │                                                            │
     │  j·sin(kΔL)/Z₀                 cos(kΔL)                   │
     └                                                            ┘
```

Where:
- `kΔL` = effective acoustic length correction
- `R` = radiation resistance
- `Z₀` = characteristic impedance at bore

### Acoustic Length Correction

```
kΔL = arctan(1 / (Z₀ · (jY_E + jY_C)))
```

Where:
- `jY_E` = imaginary admittance from embouchure
- `jY_C` = imaginary admittance from headspace volume

### Embouchure Admittance

```
jY_E = L_char / (γ · ω)
```

Where:
- `L_char` = characteristic length
- `γ` = 1.4018297351222222 (specific heat ratio constant)
- `ω` = 2πf (angular frequency)

### Characteristic Length

```
L_char = 2 · √(A_eff / π) · f_scaled
```

Where:
- `A_eff = L_w · W_w` = effective window area
- `f_scaled` = scaled fipple factor

### Scaled Fipple Factor

```
f_scaled = f_fipple · (h_default / h_windway)^(1/3)
```

Where:
- `f_fipple` = fipple factor from instrument definition (typically ~0.7)
- `h_default` = 0.00078740 m (default windway height)
- `h_windway` = actual windway height

### Headspace Admittance

```
jY_C = -(ω · V_head · 2) / (γ · c²)
```

Where:
- `V_head` = headspace volume × 2 (empirical multiplier)
- `c` = speed of sound (from SimplePhysicalParameters)

**Note**: The factor of 2 in headspace volume was determined empirically:
> "Multiplier reset using a more accurate headspace representation, and verified with a square-end flute with better intonation than the Ken Light flute that was originally used."

### Implementation

```typescript
class DefaultFippleMouthpieceCalculator {
  private static readonly DEFAULT_WINDWAY_HEIGHT = 0.00078740;
  private static readonly AIR_GAMMA = 1.4018297351222222;

  calcTransferMatrix(mouthpiece, waveNumber, params): TransferMatrix {
    this.mParams = new SimplePhysicalParameters(params);

    const radius = 0.5 * mouthpiece.boreDiameter;
    const z0 = params.calcZ0(radius);
    const omega = waveNumber * params.getSpeedOfSound();
    const k_delta_l = this.calcKDeltaL(mouthpiece, omega, z0);

    const freq = omega / (2 * Math.PI);
    const r_rad = Tube.calcR(freq, radius, params);

    const cos_kl = Math.cos(k_delta_l);
    const sin_kl = Math.sin(k_delta_l);

    const A = new Complex(cos_kl, r_rad * sin_kl / z0);
    const B = new Complex(r_rad * cos_kl, sin_kl * z0);
    const C = new Complex(0, sin_kl / z0);
    const D = new Complex(cos_kl);

    return new TransferMatrix(A, B, C, D);
  }

  private calcKDeltaL(mouthpiece, omega, z0): number {
    return Math.atan(1.0 / (z0 * (this.calcJYE(mouthpiece, omega) +
                                   this.calcJYC(mouthpiece, omega))));
  }

  private calcJYE(mouthpiece, omega): number {
    return this.getCharacteristicLength(mouthpiece) / (AIR_GAMMA * omega);
  }

  private calcJYC(mouthpiece, omega): number {
    const v = 2.0 * this.calcHeadspaceVolume(mouthpiece);
    return -(omega * v) / (AIR_GAMMA * this.mParams.getSpeedOfSound()²);
  }
}
```

---

## Flute Embouchure Calculator

Used for: **Transverse flutes**

Similar to SimpleFippleMouthpieceCalculator but for embouchure holes.

### Transfer Matrix

Same form as simple fipple:
```
     ┌               ┐
T =  │  1    Z_w     │
     │  0     1      │
     └               ┘
```

### Embouchure Impedance

```
Z_emb = R_w + j·X_w
```

Where:
```
s_eff = √(min(W, L_air) · L)
X_w = (ρ·f / s_eff) · (4.3 + 2.87·h/s_eff)
R_w = R_rad + (ρ · 0.0184 · √f · h) / s_eff³
```

Parameters:
- `W` = embouchure width
- `L` = embouchure length
- `L_air` = airstream length
- `h` = embouchure height (wall thickness)

---

## Calculator Selection

The system selects the appropriate calculator based on mouthpiece type:

```typescript
function getMouthpieceCalculator(mouthpiece: Mouthpiece): IMouthpieceCalculator {
  if (mouthpiece.fipple) {
    return defaultFippleCalculator;  // DefaultFippleMouthpieceCalculator
  }
  if (mouthpiece.embouchureHole) {
    return defaultFluteCalculator;   // FluteMouthpieceCalculator
  }
  return defaultMouthpieceCalculator; // Base MouthpieceCalculator
}
```

For instrument-specific calculators:

| Calculator | Mouthpiece Calculator | Use Case |
|------------|----------------------|----------|
| NAF | DefaultFippleMouthpieceCalculator | Native American Flutes |
| Whistle | SimpleFippleMouthpieceCalculator | Tin/penny whistles |
| Flute | FluteMouthpieceCalculator | Transverse flutes |

---

## Summary of Key Equations

| Calculator | Key Formula |
|------------|-------------|
| Simple Fipple | Z_w = R_rad + j·(ρf/s)·(4.3 + 2.87h/s) |
| Default Fipple | kΔL = arctan(1/(Z₀·(jY_E + jY_C))) |
| Flute Embouchure | Same as simple fipple |

| Quantity | Formula |
|----------|---------|
| Effective size | s_eff = √(L·W) |
| Scaled fipple | f_s = f·(h₀/h)^(1/3) |
| Char. length | L_c = 2·√(A/π)·f_s |
| Headspace volume | V = Σ(π·L/3)(r₁² + r₁r₂ + r₂²) |

## References

1. **Fletcher & Rossing** - "The Physics of Musical Instruments" - Fipple flute acoustics

2. **Auvray (2012)** - Physical modeling of flute-like instruments

3. **Coltman** - Various papers on flute acoustics and embouchure effects

4. **WWIDesigner Java source** - Original implementation by Kort, Lefebvre, Patkau

## Related Documentation

- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - TMM theory
- [BORE-SECTIONS.md](./BORE-SECTIONS.md) - Bore calculations (used for headspace)
- [TERMINATION.md](./TERMINATION.md) - Open end radiation
