# Tone Holes - Acoustic Model

This document details the equations used to model tone holes (finger holes) in woodwind instruments. All formulas are from Lefebvre & Scavone (2012).

## Overview

Tone holes are modeled as a T-network with:
- **Series impedance** Za: Accounts for bore perturbation
- **Shunt admittance** Ys = 1/Zs: Accounts for air mass and radiation in/out of hole

```
        Za/2                 Za/2
   ────/\/\/\────────────────/\/\/\────
                   │
                   │
                  ═╧═  Ys = 1/Zs
                   │
                   │
   ─────────────────────────────────────
```

## Transfer Matrix Form

From Equation 2 (Lefebvre & Scavone):

```
     ┌                                  ┐
     │  1 + Za·Ys/2    Za·(1 + Za·Ys/4) │
T =  │                                  │
     │      Ys          1 + Za·Ys/2     │
     └                                  ┘
```

Note: T11 = T22 (symmetric T-network)

## Geometry Parameters

```
                    ◄───── 2·radius ─────►
                    ┌─────────────────────┐
                    │                     │
              ┌─────┘                     └─────┐
              │  ▲                              │
 hole.height  │  │                              │
              │  ▼                              │
              └────────────────────────────────┘
                           ▲
                           │ bore
                           │
   ────────────────────────│────────────────────
                           │
              ◄─── boreDiameter ───►
```

| Parameter | Symbol | Description |
|-----------|--------|-------------|
| radius | a | Hole radius = diameter/2 × holeSizeMult |
| boreRadius | b | Bore radius at hole position |
| height | h | Hole height (wall thickness) |
| δ | a/b | Ratio of hole to bore radius |

## Length Corrections

### Matching Length (Equation 8)

Accounts for flow distortion at the hole-bore junction:

```
t_m = a · δ · (1 + 0.207·δ³) / 8
```

Effective height:
```
t_e = h + t_m
```

### Inner Length Correction (Equation 31)

Base form (no frequency dependence):
```
t_i_base = a · (0.822 + δ·(-0.095 + δ·(-1.566 + δ·(2.138 + δ·(-1.64 + δ·0.502)))))
```

This is a polynomial fit to FEM results.

## Open Hole

When the hole is open, air radiates both outward and inward.

### Inner Length Correction with Frequency (Equations 31 × 32)

```
t_i = t_i_base · (1 + (1 - 4.56·δ + 6.55·δ²) · ka · (0.17 + ka·(0.92 + ka·(0.16 - 0.29·ka))))
```

Where:
- `ka = k · b` (bore radius × wave number)

### Radiation Resistance (Equation 3)

Normalized to hole characteristic impedance:
```
R_r = (k·a)² / 4 = (kb)² / 4
```

Where:
- `kb = k · a` (hole radius × wave number)

### Radiation Length Correction (Equations 10, 11)

```
t_r = a · (0.822 - 0.47 · (a / (b + h))^0.8)
```

### Series Impedance Length (Equation 33)

```
t_a = (-0.35 + 0.06 · tanh(2.7·h/a)) · a · δ²
```

### Shunt Admittance (Equations 3, 7)

Total effective length for shunt:
```
kt_total = k·t_i + tan(k·(t_e + t_r))
```

Shunt admittance:
```
Y_s = 1 / (Z_0h · (j·kt_total + R_r))
```

Where `Z_0h = ρc/(π·a²)` is the hole characteristic impedance.

## Closed Hole (Finger)

When closed by a player's finger:

### Series Impedance Length (Equation 34, revised)

```
t_a = (-0.2 - 0.1 · tanh(2.4·h/a)) · a · δ²
```

### Finger Adjustment

Accounts for finger cap intrusion:
```
t_f = a² / fingerAdjustment    (if fingerAdjustment > 0)
t_f = 0                        (otherwise)
```

Typical values:
- `fingerAdjustment = 0.01` - Default (Dickens 2007 thesis)
- `fingerAdjustment = 0.02` - Cap volume of 13mm sphere
- `fingerAdjustment = 0.011` - Cap height of 13mm sphere
- `fingerAdjustment = 0.0` - NAF calculator (no adjustment)

### Shunt Admittance (Equation 16)

```
tan_kt = tan(k·(t_e - t_f))
Y_s = j · tan_kt / (Z_0h · (1 - k·t_i_base · tan_kt))
```

## Closed Hole (Key)

When closed by a mechanical key (no finger intrusion):

### Series Impedance Length

```
t_a = (-0.12 - 0.17 · tanh(2.4·h/a)) · a · δ²
```

### Shunt Admittance

```
tan_kt = tan(k·t_e)
Y_s = j · tan_kt / (Z_0h · (1 - k·t_i_base · tan_kt))
```

## Plugged Hole

When hole is completely blocked (no acoustic effect):

```
t_a = 0
Y_s = 0
```

The transfer matrix becomes identity.

## Series Impedance

For all cases (Equations 4, 6):

```
Z_a = j · Z_0h · δ² · k · t_a
```

Note: `Z_0h · δ²` = `Z_0` (bore characteristic impedance).

## Implementation

```typescript
calcTransferMatrix(
  hole: Hole,
  isOpen: boolean,
  waveNumber: number,
  params: PhysicalParameters
): TransferMatrix {
  const radius = this.holeSizeMult * hole.diameter / 2.0;
  const boreRadius = (hole.boreDiameter ?? hole.diameter * 2) / 2.0;

  let Ys = Complex.ZERO;  // Shunt admittance
  let Za = Complex.ZERO;  // Series impedance

  const Z0h = params.calcZ0(radius);
  const delta = radius / boreRadius;
  const delta2 = delta * delta;

  // Matching length (Eq. 8)
  const tm = 0.125 * radius * delta * (1.0 + 0.207 * delta * delta2);
  const te = hole.height + tm;

  // Inner length base (Eq. 31)
  const ti_base = radius * (0.822 + delta * (-0.095 + delta * (-1.566 +
                    delta * (2.138 + delta * (-1.64 + delta * 0.502)))));

  let ta = 0.0;

  if (isOpen) {
    const kb = waveNumber * radius;
    const ka = waveNumber * boreRadius;

    // Series impedance length (Eq. 33)
    ta = (-0.35 + 0.06 * Math.tanh(2.7 * hole.height / radius)) * radius * delta2;

    // Inner length with frequency (Eq. 31 × 32)
    const ti = ti_base * (1.0 + (1.0 - 4.56 * delta + 6.55 * delta2) *
                          ka * (0.17 + ka * (0.92 + ka * (0.16 - 0.29 * ka))));

    // Radiation resistance (Eq. 3)
    const Rr = 0.25 * kb * kb;

    // Radiation length (Eq. 11)
    const tr = radius * (0.822 - 0.47 * Math.pow(radius / (boreRadius + hole.height), 0.8));

    // Shunt admittance (Eq. 3, 7)
    const kttotal = waveNumber * ti + Math.tan(waveNumber * (te + tr));
    Ys = Complex.ONE.divide(
      Complex.I.multiply(kttotal).add(new Complex(Rr, 0)).multiply(Z0h)
    );

  } else if (this.isPlugged) {
    ta = 0.0;
    Ys = Complex.ZERO;

  } else if (hole.key === undefined) {
    // Closed by finger (Eq. 34)
    ta = (-0.2 - 0.1 * Math.tanh(2.4 * hole.height / radius)) * radius * delta2;

    let tf = 0.0;
    if (this.fingerAdjustment > 0.0) {
      tf = (radius * radius) / this.fingerAdjustment;
    }

    // Shunt admittance (Eq. 16)
    const tankt = Math.tan(waveNumber * (te - tf));
    Ys = new Complex(0.0, tankt / (Z0h * (1.0 - waveNumber * ti_base * tankt)));

  } else {
    // Closed by key
    ta = (-0.12 - 0.17 * Math.tanh(2.4 * hole.height / radius)) * radius * delta2;
    const tankt = Math.tan(waveNumber * te);
    Ys = new Complex(0.0, tankt / (Z0h * (1.0 - waveNumber * ti_base * tankt)));
  }

  // Series impedance (Eq. 4, 6)
  Za = Complex.I.multiply(Z0h * delta2 * waveNumber * ta);
  const Za_Zs = Za.multiply(Ys);

  // Transfer matrix (Eq. 2)
  const A = Za_Zs.divide(2.0).add(Complex.ONE);
  const B = Za.multiply(Za_Zs.divide(4.0).add(Complex.ONE));
  const C = Ys;

  return new TransferMatrix(A, B, C, A);
}
```

## Hole Size Multiplier

Some calculators apply a size multiplier to the hole radius:

```typescript
const radius = holeSizeMult * hole.diameter / 2.0;
```

| Calculator | holeSizeMult | Purpose |
|------------|--------------|---------|
| Default | 1.0 | Standard holes |
| NAF | 0.9605 | Empirically tuned for NAF |
| Whistle | 1.0 | Standard holes |

The NAF multiplier (0.9605) was determined from validation runs (June 2019) to achieve best match with measured instruments.

## Summary of Equations by Case

| Quantity | Open Hole | Closed (Finger) | Closed (Key) |
|----------|-----------|-----------------|--------------|
| t_a | Eq. 33 | Eq. 34 | Modified Eq. 34 |
| t_i | Eq. 31 × 32 | t_i_base | t_i_base |
| Y_s | Eq. 3, 7 | Eq. 16 | Modified Eq. 16 |
| Radiation | Yes (R_r, t_r) | No | No |

## References

1. **Lefebvre & Scavone (2012)**: "Characterization of woodwind instrument toneholes with the finite element method", J. Acoust. Soc. Am. V. 131 (n. 4), April 2012.

2. **Dickens (2007)**: PhD thesis on flute acoustics - Source of default finger adjustment.

3. **Keefe (1990)**: Earlier tonehole model that this work builds upon.

## Related Documentation

- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - Overall TMM theory
- [BORE-SECTIONS.md](./BORE-SECTIONS.md) - Bore sections between holes
- [MOUTHPIECES.md](./MOUTHPIECES.md) - Mouthpiece calculations
