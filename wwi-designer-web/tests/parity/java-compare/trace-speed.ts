/**
 * Trace speed of sound calculation to find discrepancy with Java.
 */

// Java values at 72°F (22.222222°C)
const ambientTemp = 22.222222222222222;
const relativeHumidity = 0.45;
const p = 101000;

const a = [
  331.5024,    // a[0]
  0.603055,    // a[1]
  -0.000528,   // a[2]
  51.471935,   // a[3]
  0.1495874,   // a[4]
  -0.000782,   // a[5]
  -1.82e-7,    // a[6]
  3.73e-8,     // a[7]
  -2.93e-10,   // a[8]
  -85.20931,   // a[9]
  -0.228525,   // a[10]
  5.91e-5,     // a[11]
  -2.835149,   // a[12]
  -2.15e-13,   // a[13]
  29.179762,   // a[14]
  0.000486,    // a[15]
];

console.log("=== Speed of Sound Calculation Trace ===\n");
console.log(`ambientTemp: ${ambientTemp}`);
console.log(`relativeHumidity: ${relativeHumidity}`);
console.log(`p: ${p}`);

const T = ambientTemp + 273.15;
console.log(`T = ${T}`);

const f = 1.00062 + 0.0000000314 * p + 0.00000056 * ambientTemp * ambientTemp;
console.log(`f = ${f}`);

const Psv = Math.exp(
  0.000012811805 * T * T - 0.019509874 * T + 34.04926034 - 6353.6311 / T
);
console.log(`Psv = ${Psv}`);

const Xw = (relativeHumidity * f * Psv) / p;
console.log(`Xw = ${Xw}`);

let c = 331.45 - a[0] - p * a[6] - a[13] * p * p;
console.log(`c (step 1) = ${c}`);

c = Math.sqrt(a[9] * a[9] + 4 * a[14] * c);
console.log(`c (step 2) = ${c}`);

const Xc = (-a[9] - c) / (2 * a[14]);
console.log(`Xc = ${Xc}`);

const speed =
  a[0] +
  a[1] * ambientTemp +
  a[2] * ambientTemp * ambientTemp +
  (a[3] + a[4] * ambientTemp + a[5] * ambientTemp * ambientTemp) * Xw +
  (a[6] + a[7] * ambientTemp + a[8] * ambientTemp * ambientTemp) * p +
  (a[9] + a[10] * ambientTemp + a[11] * ambientTemp * ambientTemp) * Xc +
  a[12] * Xw * Xw +
  a[13] * p * p +
  a[14] * Xc * Xc +
  a[15] * Xw * p * Xc;

console.log(`speed = ${speed} m/s`);

// Individual terms
console.log("\n=== Individual Terms ===");
console.log(`a[0] = ${a[0]}`);
console.log(`a[1]*T = ${a[1] * ambientTemp}`);
console.log(`a[2]*T² = ${a[2] * ambientTemp * ambientTemp}`);
console.log(`(a[3]+a[4]*T+a[5]*T²)*Xw = ${(a[3] + a[4] * ambientTemp + a[5] * ambientTemp * ambientTemp) * Xw}`);
console.log(`(a[6]+a[7]*T+a[8]*T²)*p = ${(a[6] + a[7] * ambientTemp + a[8] * ambientTemp * ambientTemp) * p}`);
console.log(`(a[9]+a[10]*T+a[11]*T²)*Xc = ${(a[9] + a[10] * ambientTemp + a[11] * ambientTemp * ambientTemp) * Xc}`);
console.log(`a[12]*Xw² = ${a[12] * Xw * Xw}`);
console.log(`a[13]*p² = ${a[13] * p * p}`);
console.log(`a[14]*Xc² = ${a[14] * Xc * Xc}`);
console.log(`a[15]*Xw*p*Xc = ${a[15] * Xw * p * Xc}`);

console.log(`\nExpected Java value: 344.751958 m/s`);
console.log(`Difference: ${speed - 344.751958} m/s`);
