# Physical Parameters - Air Properties

This document details the equations used to calculate air properties for acoustic modeling. All formulas are from CIPM-2007 (Committee on Data for Science and Technology) and Tsilingiris (2008).

## Overview

Air properties vary with temperature, pressure, humidity, and CO2 concentration. These variations significantly affect:
- Speed of sound (±3% over typical range)
- Air density (±5% over typical range)
- Viscous losses in narrow tubes

## Input Parameters

| Parameter | Symbol | Units | Typical Value |
|-----------|--------|-------|---------------|
| Temperature | T | °C | 20-25 |
| Pressure | p | kPa | 101.325 (sea level) |
| Relative Humidity | RH | % | 45-60 |
| CO2 Molar Fraction | x_CO2 | mol/mol | 0.00039 (390 ppm) |

## Physical Constants

```typescript
const R = 8.314472;      // Universal gas constant, J/(mol·K)
const Ma0 = 28.960745;   // Molar mass of CO2-free dry air, kg/kmol
const Mco2 = 44.01;      // Molar mass of CO2, kg/kmol
const Mo2 = 31.9988;     // Molar mass of O2, kg/kmol
const Mv = 18.01527;     // Molar mass of water vapour, kg/kmol
```

## Calculated Properties

### 1. Saturated Vapour Pressure (CIPM-2007)

The partial pressure of water at saturation:

```
P_sv = exp(A·T² + B·T + C + D/T) / 1000  [kPa]
```

Where T is absolute temperature (K) and:
- A = 1.2378847×10⁻⁵
- B = -1.9121316×10⁻²
- C = 33.93711047
- D = -6.3431645×10³

### 2. Enhancement Factor (CIPM-2007)

Correction for non-ideal gas behavior:

```
f = 1.00062 + 3.14×10⁻⁵·p + 5.6×10⁻⁷·t²
```

Where:
- p = pressure in kPa
- t = temperature in °C

### 3. Molar Fraction of Water Vapour

```
x_v = (RH/100) · f · P_sv / p
```

Where RH is relative humidity in percent.

### 4. Compressibility Factor (CIPM-2007)

Accounts for deviation from ideal gas:

```
Z = 1 - (p/T)·[a₀ + a₁·t + a₂·t² + (a₃ + a₄·t)·x_v + (a₅ + a₆·t)·x_v²]
    + (p/T)²·[a₇ + a₈·x_v²]
```

Coefficients:
| Coefficient | Value |
|-------------|-------|
| a₀ | 1.58123×10⁻⁶ |
| a₁ | -2.9331×10⁻⁸ |
| a₂ | 1.1043×10⁻¹⁰ |
| a₃ | 5.707×10⁻⁶ |
| a₄ | -2.051×10⁻⁸ |
| a₅ | 1.9898×10⁻⁴ |
| a₆ | -2.376×10⁻⁶ |
| a₇ | 1.83×10⁻¹¹ |
| a₈ | -0.765×10⁻⁸ |

### 5. Molar Mass of Humid Air

Dry air molar mass (accounting for CO2):
```
Ma = Ma0 + (Mco2 - Mo2)·x_CO2
```

Humid air molar mass:
```
M = (1 - x_v)·Ma + x_v·Mv
```

### 6. Air Density (CIPM-2007)

```
ρ = p / (Z · R_a · T)
```

Where:
- p = pressure in Pa
- Z = compressibility factor
- R_a = R / (0.001·M) = specific gas constant of humid air
- T = temperature in Kelvin

Typical values: 1.18-1.22 kg/m³ at room temperature

### 7. Dynamic Viscosity

Using Sutherland's formula for dry air:
```
η_air = (1.4592×10⁻⁶ · T^1.5) / (T + 109.1)
```

Water vapour viscosity:
```
η_vapour = 8.058131868×10⁻⁶ + t·4.000549451×10⁻⁸
```

Combined using Wilke's mixing rule:
```
η = η_air/(1 + φ_AV·h) + h·η_vapour/(h + φ_VA)
```

Where:
- h = x_v / (1 - x_v) is the humidity ratio
- φ_AV, φ_VA are mixing coefficients from kinetic theory

Typical values: 1.81-1.85×10⁻⁵ Pa·s

### 8. Specific Heat at Constant Pressure

Dry air (polynomial fit):
```
cp_air = 1032 + T·(-0.284887 + T·(0.7816818×10⁻³ + T·(-0.4970786×10⁻⁶ + T·0.1077024×10⁻⁹)))
```

Water vapour:
```
cp_vapour = 1869.10989 + t·(-0.2578421578 + t·1.941058941×10⁻²)
```

CO2:
```
cp_CO2 = 817.02 + t·(1.0562 - t·6.67×10⁻⁴)
```

Combined:
```
cp = cp_air·(1 - q_v - q_CO2) + cp_vapour·q_v + cp_CO2·q_CO2
```

Where q_v, q_CO2 are mass fractions.

Typical values: 1005-1010 J/(kg·K)

### 9. Specific Heat Ratio (γ)

```
γ = cp / cv = cp / (cp - R_a)
```

Typical values: 1.399-1.402

### 10. Thermal Conductivity

Dry air:
```
κ_air = (2.334×10⁻³ · T^1.5) / (T + 164.54)
```

Water vapour:
```
κ_vapour = 0.01761758242 + t·(5.558941059×10⁻⁵ + t·1.663336663×10⁻⁷)
```

Combined using Wilke's rule (same φ coefficients as viscosity):
```
κ = κ_air/(1 + φ_AV·h) + h·κ_vapour/(h + φ_VA)
```

Typical values: 0.025-0.026 W/(m·K)

### 11. Prandtl Number

```
Pr = η·cp / κ
```

Typical values: 0.71-0.72

### 12. Speed of Sound

From the ideal gas equation with compressibility:
```
c = √(γ · Z · R_a · T)
```

Typical values: 343-346 m/s at room temperature

### 13. Alpha Constant (Loss Factor)

The alpha constant determines viscothermal losses:
```
α = √(η / (2·ρ·c)) · (1 + (γ-1)/√Pr)
```

This combines viscous and thermal boundary layer effects.

Used in complex wave number calculation:
```
k_complex = k·(1 + ε - j·ε)

where ε = α / (r·√k)
```

Typical values: ~3×10⁻⁵

**Implementation Note**: The Java implementation stores both `mAlphaConstant` and a precomputed `mEpsilonConstant` (= α/√k). The TypeScript implementation stores only `alphaConstant` and computes ε dynamically at each frequency using `α / (r·√k)`. Both approaches yield identical results; the TypeScript approach avoids redundant state while the Java approach trades memory for marginally faster repeated calculations.

## Usage Example

```typescript
import { PhysicalParameters } from "./physics/physical-parameters.ts";

// Standard conditions (72°F, 45% humidity)
const params = new PhysicalParameters();

// Custom temperature
const paramsCustom = new PhysicalParameters(20, "C");

// Full specification
const paramsFull = new PhysicalParameters(
  25,        // temperature in Celsius
  "C",       // temperature type
  101.325,   // pressure in kPa
  50,        // relative humidity %
  0.00042    // CO2 molar fraction
);

// Access calculated values
console.log(`Speed of sound: ${params.getSpeedOfSound().toFixed(2)} m/s`);
console.log(`Air density: ${params.getRho().toFixed(4)} kg/m³`);
console.log(`Gamma: ${params.getGamma().toFixed(4)}`);

// Calculate wave number
const freq = 440; // Hz
const k = params.calcWaveNumber(freq); // 2πf/c

// Calculate characteristic impedance
const radius = 0.01; // 10mm bore radius
const Z0 = params.calcZ0(radius); // ρc/πr²
```

## Pressure at Altitude

Standard barometric formula:
```
p(h) = p_0 · exp(-g·Ma·h / (R·T_0))
```

Where:
- g = 9.80665 m/s²
- h = elevation in meters
- T_0 = 288.15 K (standard temperature)

```typescript
// Sea level barometer reading 101.325 kPa at 1000m elevation
const actualPressure = PhysicalParameters.pressureAt(101.325, 1000);
// ≈ 89.9 kPa

// Standard pressure at elevation
const standardPressure = PhysicalParameters.standardPressureAt(1000);
// ≈ 89.9 kPa
```

## Validation Data

From Java PhysicalParametersTest.java:

| Condition | Temperature | Humidity | Pressure | Speed of Sound |
|-----------|-------------|----------|----------|----------------|
| Dry air, 0°C | 0°C | 0% | 101.325 kPa | 331.34 m/s |
| Dry air, 20°C | 20°C | 0% | 101.325 kPa | 343.23 m/s |
| Saturated air, 20°C | 20°C | 100% | 101.325 kPa | 344.47 m/s |
| Exhaled air, 37°C | 37°C | ~100% | 101.325 kPa | 353.22 m/s |
| Low pressure | 20°C | 100% | 90 kPa | 344.64 m/s |

All values match Java implementation within 0.01 m/s.

## References

1. **CIPM-2007**: Picard, A., Davis, R.S., Glaser, M., & Fujii, K. (2008). "Revised formula for the density of moist air". Metrologia 45, p.149-155.

2. **Tsilingiris (2008)**: Tsilingiris, P.T. "Thermophysical and transport properties of humid air at temperature range between 0 and 100°C". Energy Conversion and Management 49, p.1098-1110.

3. **Sutherland's Formula**: For dynamic viscosity of gases.

4. **Wilke's Mixing Rule**: For properties of gas mixtures.

## Related Documentation

- [TRANSFER-MATRIX-METHOD.md](./TRANSFER-MATRIX-METHOD.md) - How these values are used
- [BORE-SECTIONS.md](./BORE-SECTIONS.md) - Loss calculations in tubes
