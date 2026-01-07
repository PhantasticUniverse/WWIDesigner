/**
 * TypeScript parity test - outputs same values as SimpleParityTest.java for comparison.
 */

import { SimplePhysicalParameters } from "../../../src/core/physics/simple-physical-parameters.ts";
import { PhysicalParameters } from "../../../src/core/physics/physical-parameters.ts";
import { Complex } from "../../../src/core/math/complex.ts";
import { Tube } from "../../../src/core/geometry/tube.ts";

// Constants from DefaultFippleMouthpieceCalculator
const DEFAULT_WINDWAY_HEIGHT = 0.00078740;
const AIR_GAMMA = 1.4018297351222222;

function main() {
  console.log("=== TypeScript Parity Values ===\n");

  // Test SimplePhysicalParameters at 72°F
  const tempF = 72.0;
  const tempC = (tempF + 40.0) * 5.0 / 9.0 - 40.0;
  console.log(`Temperature: ${tempF.toFixed(6)}°F = ${tempC.toFixed(6)}°C`);

  // Create SimplePhysicalParameters
  const params = new PhysicalParameters(72, "F");
  const simpleParams = new SimplePhysicalParameters(params);

  const speedOfSound = simpleParams.getSpeedOfSound();
  console.log(`Speed of sound (Yang Yili, 45% humidity): ${speedOfSound.toFixed(6)} m/s`);

  // PhysicalParameters uses ASHRAE model (different from SimplePhysicalParameters)
  console.log(`\n=== PhysicalParameters (ASHRAE model) ===`);
  console.log(`PhysParams.speedOfSound: ${params.getSpeedOfSound().toFixed(6)} m/s`);
  console.log(`PhysParams.rho: ${params.getRho().toFixed(6)} kg/m³`);
  console.log(`PhysParams.calcZ0(radius=${(0.0295402/2).toFixed(6)}): ${params.calcZ0(0.0295402/2).toFixed(4)}`);
  console.log(`PhysParams.waveNumber(289.42): ${params.calcWaveNumber(289.42).toFixed(9)}`);

  const rho = simpleParams.getRho();
  const gamma = simpleParams.getGamma();
  const eta = simpleParams.getEta();
  const nu = simpleParams.getNu();
  const alphaConstant = simpleParams.getAlphaConstant();
  const waveNumber1 = 2.0 * Math.PI / speedOfSound;

  // Calculate mu from linear approximation
  const deltaT = tempC - 26.85;
  const mu = 1.846e-5 * (1.0 + 0.0025 * deltaT);

  console.log(`Rho: ${rho.toFixed(6)} kg/m³`);
  console.log(`Gamma: ${gamma.toFixed(6)}`);
  console.log(`Mu: ${mu.toFixed(9)}`);
  console.log(`Nu: ${nu.toFixed(6)}`);
  console.log(`Eta: ${eta.toFixed(9)}`);
  console.log(`Wave number at 1 Hz: ${waveNumber1.toFixed(9)} rad/m`);
  console.log(`Alpha constant: ${alphaConstant.toFixed(9)}`);

  // Test values matching NAF_D_minor_cherry instrument (converted to metres)
  const mpPosition = 0.0043180280;
  const mpBoreDiameter = 0.0295402;
  const windowLength = 0.0043180350;
  const windowWidth = 0.0173736282;
  const fippleFactor = 0.7310016502433632;
  const windwayHeight = 0.0008128031;

  console.log("\n=== Mouthpiece Values ===");
  console.log(`Position: ${mpPosition.toFixed(10)} m (${(mpPosition * 1000).toFixed(4)} mm)`);
  console.log(`Bore diameter: ${mpBoreDiameter.toFixed(10)} m (${(mpBoreDiameter * 1000).toFixed(4)} mm)`);
  console.log(`Window length: ${windowLength.toFixed(10)} m (${(windowLength * 1000).toFixed(4)} mm)`);
  console.log(`Window width: ${windowWidth.toFixed(10)} m (${(windowWidth * 1000).toFixed(4)} mm)`);
  console.log(`Fipple factor: ${fippleFactor.toFixed(10)}`);
  console.log(`Windway height: ${windwayHeight.toFixed(10)} m (${(windwayHeight * 1000).toFixed(4)} mm)`);

  // Headspace calculation
  const firstBorePos = -0.000762003;
  const hsLength = mpPosition - firstBorePos;
  const hsRadius = mpBoreDiameter / 2;
  const hsVolume = Math.PI * hsRadius * hsRadius * hsLength;

  console.log("\n=== Headspace Calculation ===");
  console.log(`First bore point position: ${firstBorePos.toFixed(10)} m (${(firstBorePos * 1000).toFixed(4)} mm)`);
  console.log(`Headspace length (Java bore sections): ${hsLength.toFixed(10)} m (${(hsLength * 1000).toFixed(4)} mm)`);
  console.log(`Headspace volume: ${hsVolume.toFixed(15)} m³ (${(hsVolume * 1e9).toFixed(4)} mm³)`);
  console.log(`Headspace volume * 2: ${(hsVolume * 2).toFixed(15)} m³`);

  // Position-based headspace
  const posBasedVolume = Math.PI * hsRadius * hsRadius * mpPosition;
  console.log(`Position-based volume: ${posBasedVolume.toFixed(15)} m³ (${(posBasedVolume * 1e9).toFixed(4)} mm³)`);
  console.log(`Position-based * 2: ${(posBasedVolume * 2).toFixed(15)} m³`);
  console.log(`Bore-section / Position-based ratio: ${(hsVolume / posBasedVolume).toFixed(6)}`);

  // Test frequency: D4 at 289.42 Hz
  const freq = 289.42;
  const omega = 2 * Math.PI * freq;
  const waveNumber = waveNumber1 * freq;
  const radius = mpBoreDiameter / 2;
  const z0 = rho * speedOfSound / (Math.PI * radius * radius);

  console.log("\n=== Calculation at 289.42 Hz ===");
  console.log(`Frequency: ${freq.toFixed(2)} Hz`);
  console.log(`Omega: ${omega.toFixed(6)} rad/s`);
  console.log(`Wave number: ${waveNumber.toFixed(6)} rad/m`);
  console.log(`z0: ${z0.toFixed(4)}`);

  // Characteristic length calculation
  const effectiveArea = windowLength * windowWidth;
  const ratio = Math.pow(DEFAULT_WINDWAY_HEIGHT / windwayHeight, 1.0 / 3.0);
  const scaledFippleFactor = fippleFactor * ratio;
  const equivDiameter = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;

  console.log("\n=== Fipple Calculations ===");
  console.log(`Effective area: ${effectiveArea.toFixed(15)} m² (${(effectiveArea * 1e6).toFixed(4)} mm²)`);
  console.log(`Windway height ratio: ${ratio.toFixed(10)}`);
  console.log(`Scaled fipple factor: ${scaledFippleFactor.toFixed(10)}`);
  console.log(`Equivalent diameter (characteristic length): ${equivDiameter.toFixed(10)} m (${(equivDiameter * 1000).toFixed(4)} mm)`);

  // JYE calculation
  const JYE = equivDiameter / (AIR_GAMMA * omega);
  console.log(`JYE: ${JYE.toExponential(15)}`);

  // JYC calculation (bore-section)
  const v_boresection = 2.0 * hsVolume * 2.0;
  const JYC_boresection = -(omega * v_boresection) / (AIR_GAMMA * speedOfSound * speedOfSound);
  console.log(`JYC (bore-section): ${JYC_boresection.toExponential(15)}`);

  // JYC calculation (position-based)
  const v_position = 2.0 * posBasedVolume * 2.0;
  const JYC_position = -(omega * v_position) / (AIR_GAMMA * speedOfSound * speedOfSound);
  console.log(`JYC (position-based): ${JYC_position.toExponential(15)}`);

  // k_delta_l
  const k_delta_l_bore = Math.atan(1.0 / (z0 * (JYE + JYC_boresection)));
  const k_delta_l_pos = Math.atan(1.0 / (z0 * (JYE + JYC_position)));
  console.log("\n=== k_delta_l ===");
  console.log(`JYE + JYC (bore-section): ${(JYE + JYC_boresection).toExponential(15)}`);
  console.log(`JYE + JYC (position-based): ${(JYE + JYC_position).toExponential(15)}`);
  console.log(`k_delta_l (bore-section): ${k_delta_l_bore.toFixed(10)} rad (${(k_delta_l_bore * 180 / Math.PI).toFixed(4)} deg)`);
  console.log(`k_delta_l (position-based): ${k_delta_l_pos.toFixed(10)} rad (${(k_delta_l_pos * 180 / Math.PI).toFixed(4)} deg)`);

  // Transfer matrix elements
  const cos_kl = Math.cos(k_delta_l_pos);
  const sin_kl = Math.sin(k_delta_l_pos);
  const r_rad = Tube.calcR(freq, radius, params);

  console.log("\n=== Transfer Matrix (position-based) ===");
  console.log(`cos(k_delta_l): ${cos_kl.toFixed(10)}`);
  console.log(`sin(k_delta_l): ${sin_kl.toFixed(10)}`);
  console.log(`r_rad: ${r_rad.toFixed(10)}`);

  const A = new Complex(cos_kl, r_rad * sin_kl / z0);
  const B = Complex.I.multiply(sin_kl * z0).add(new Complex(r_rad * cos_kl, 0));
  const C = Complex.I.multiply(sin_kl / z0);
  const D = new Complex(cos_kl, 0);

  console.log(`A: (${A.re.toFixed(10)}, ${A.im.toFixed(10)})`);
  console.log(`B: (${B.re.toFixed(10)}, ${B.im.toFixed(10)})`);
  console.log(`C: (${C.re.toFixed(10)}, ${C.im.toFixed(10)})`);
  console.log(`D: (${D.re.toFixed(10)}, ${D.im.toFixed(10)})`);
}

main();
