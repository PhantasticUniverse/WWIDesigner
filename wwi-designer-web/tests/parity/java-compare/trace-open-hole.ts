/**
 * Trace open hole calculation to compare with Java.
 */

import { parseInstrumentXml } from "../../../src/utils/xml-converter.ts";

const MODELLING_PATH = "tests/parity/fixtures/java-examples/modelling";
const INCH_TO_METRE = 0.0254;

async function main() {
  const instFile = Bun.file(`${MODELLING_PATH}/NAF_D_minor_cherry_actual_geometry.xml`);
  const instrument = parseInstrumentXml(await instFile.text());

  // Get Hole 6 (first hole in list)
  const hole = instrument.hole[0];
  console.log("=== Open Hole Calculation Trace (Hole 6) ===\n");

  // Convert to metres
  const holeDiameter = hole!.diameter * INCH_TO_METRE;
  const holeHeight = hole!.height * INCH_TO_METRE;
  const boreDiameter = instrument.borePoint[0]!.boreDiameter * INCH_TO_METRE;

  console.log("=== Hole Parameters (in metres) ===");
  console.log(`Hole diameter: ${holeDiameter} m`);
  console.log(`Hole height: ${holeHeight} m`);
  console.log(`Bore diameter at hole: ${boreDiameter} m`);

  // Calculate for F4 = 331.14 Hz
  const freq = 331.14;
  const speedOfSound = 345.30996202562744; // SimplePhysicalParameters at 72°F
  const rho = 1.1951455460833333;
  const waveNumber = (2 * Math.PI * freq) / speedOfSound;
  const holeSizeMult = 0.9605;

  console.log(`\n=== At frequency ${freq} Hz ===`);
  console.log(`Wave number: ${waveNumber}`);

  // Hole calculator values
  const radius = holeSizeMult * holeDiameter / 2;
  const boreRadius = boreDiameter / 2;
  const Z0h = (rho * speedOfSound) / (Math.PI * radius * radius);

  console.log(`\n=== Hole Calculator Values ===`);
  console.log(`radius (with mult): ${radius}`);
  console.log(`boreRadius: ${boreRadius}`);
  console.log(`Z0h: ${Z0h}`);

  const delta = radius / boreRadius;
  const delta2 = delta * delta;

  console.log(`delta: ${delta}`);
  console.log(`delta2: ${delta2}`);

  // Equation 8
  const tm = 0.125 * radius * delta * (1.0 + 0.207 * delta * delta2);
  const te = holeHeight + tm;

  console.log(`\n=== te calculation ===`);
  console.log(`tm (eq 8): ${tm}`);
  console.log(`te = height + tm: ${te}`);

  // ti_base (Equation 31)
  const ti_base =
    radius *
    (0.822 +
      delta *
        (-0.095 +
          delta * (-1.566 + delta * (2.138 + delta * (-1.64 + delta * 0.502)))));

  console.log(`ti_base (eq 31): ${ti_base}`);

  // Open hole calculations
  const kb = waveNumber * radius;
  const ka = waveNumber * boreRadius;

  console.log(`\n=== Open hole values ===`);
  console.log(`kb: ${kb}`);
  console.log(`ka: ${ka}`);

  // Equation 33
  const ta = (-0.35 + 0.06 * Math.tanh((2.7 * holeHeight) / radius)) * radius * delta2;
  console.log(`ta (eq 33): ${ta}`);

  // Equation 31 * 32
  const ti =
    ti_base *
    (1.0 +
      (1.0 - 4.56 * delta + 6.55 * delta2) *
        ka *
        (0.17 + ka * (0.92 + ka * (0.16 - 0.29 * ka))));
  console.log(`ti (eq 31*32): ${ti}`);

  // Radiation resistance
  const Rr = 0.25 * kb * kb;
  console.log(`Rr: ${Rr}`);

  // tr (equation 11 * radius)
  const outerRadius = radius / (boreRadius + holeHeight);
  const tr = radius * (0.822 - 0.47 * Math.pow(outerRadius, 0.8));
  console.log(`outerRadius ratio: ${outerRadius}`);
  console.log(`tr (eq 11): ${tr}`);

  // kttotal
  const kttotal = waveNumber * ti + Math.tan(waveNumber * (te + tr));
  console.log(`\n=== Final calculation ===`);
  console.log(`waveNumber * ti: ${waveNumber * ti}`);
  console.log(`waveNumber * (te + tr): ${waveNumber * (te + tr)}`);
  console.log(`tan(waveNumber * (te + tr)): ${Math.tan(waveNumber * (te + tr))}`);
  console.log(`kttotal: ${kttotal}`);

  // Ys (shunt admittance)
  // Ys = 1 / ((j*kttotal + Rr) * Z0h)
  // = 1 / (Rr*Z0h + j*kttotal*Z0h)
  const denom_re = Rr * Z0h;
  const denom_im = kttotal * Z0h;
  const denom_mag2 = denom_re * denom_re + denom_im * denom_im;
  const Ys_re = denom_re / denom_mag2;
  const Ys_im = -denom_im / denom_mag2;

  console.log(`\nYs denominator (Rr*Z0h, kttotal*Z0h): (${denom_re}, ${denom_im})`);
  console.log(`Ys: (${Ys_re}, ${Ys_im})`);

  // Za (series impedance)
  // Za = j * Z0h * delta2 * waveNumber * ta
  const Za_im = Z0h * delta2 * waveNumber * ta;
  console.log(`Za: (0, ${Za_im})`);

  // Transfer matrix elements
  // Za_Zs = Za * Ys (multiply complex numbers)
  // Za = (0, Za_im), Ys = (Ys_re, Ys_im)
  // (0, Za_im) * (Ys_re, Ys_im) = (0*Ys_re - Za_im*Ys_im, 0*Ys_im + Za_im*Ys_re)
  //                            = (-Za_im*Ys_im, Za_im*Ys_re)
  const Za_Zs_re = -Za_im * Ys_im;
  const Za_Zs_im = Za_im * Ys_re;

  console.log(`\nZa_Zs: (${Za_Zs_re}, ${Za_Zs_im})`);

  // A = Za_Zs/2 + 1
  const A_re = Za_Zs_re / 2 + 1;
  const A_im = Za_Zs_im / 2;
  console.log(`A = Za_Zs/2 + 1: (${A_re}, ${A_im})`);

  // B = Za * (Za_Zs/4 + 1)
  // Za = (0, Za_im), (Za_Zs/4 + 1) = (Za_Zs_re/4 + 1, Za_Zs_im/4)
  const B_factor_re = Za_Zs_re / 4 + 1;
  const B_factor_im = Za_Zs_im / 4;
  // (0, Za_im) * (B_factor_re, B_factor_im) = (-Za_im*B_factor_im, Za_im*B_factor_re)
  const B_re = -Za_im * B_factor_im;
  const B_im = Za_im * B_factor_re;
  console.log(`B = Za*(Za_Zs/4+1): (${B_re}, ${B_im})`);

  console.log(`\n=== Transfer Matrix (open hole) ===`);
  console.log(`A: (${A_re}, ${A_im})`);
  console.log(`B: (${B_re}, ${B_im})`);
  console.log(`C: (${Ys_re}, ${Ys_im})`);
  console.log(`D: (${A_re}, ${A_im})`);
}

main().catch(console.error);
