/**
 * Standalone Java parity test - tests core calculation values without XML parsing.
 * Outputs key intermediate values for comparison with TypeScript.
 */

import org.apache.commons.math3.complex.Complex;

public class SimpleParityTest {
    // Constants from DefaultFippleMouthpieceCalculator
    private static final double DEFAULT_WINDWAY_HEIGHT = 0.00078740;
    private static final double AIR_GAMMA = 1.4018297351222222;

    public static void main(String[] args) {
        System.out.println("=== Java Parity Values ===\n");

        // Test SimplePhysicalParameters at 72°F
        double tempF = 72.0;
        double tempC = (tempF + 40.0) * 5.0 / 9.0 - 40.0;
        System.out.printf("Temperature: %.6f°F = %.6f°C%n", tempF, tempC);

        // Speed of sound using Yang Yili formula
        double speedOfSound = calculateSpeedOfSound(tempC, 0.45);
        System.out.printf("Speed of sound (Yang Yili, 45%% humidity): %.6f m/s%n", speedOfSound);

        // Linear approximations
        double deltaT = tempC - 26.85;
        double rho = 1.1769 * (1.0 - 0.00335 * deltaT);
        double mu = 1.846e-5 * (1.0 + 0.0025 * deltaT);
        double gamma = 1.4017 * (1.0 - 0.00002 * deltaT);
        double nu = 0.841 * (1.0 - 0.0002 * deltaT);
        double eta = 3.648e-6 * (1.0 + 0.0135003 * (tempC + 273.15));
        double waveNumber1 = 2.0 * Math.PI / speedOfSound;
        double alphaConstant = Math.sqrt(mu / (2.0 * rho * speedOfSound)) * (1.0 + (gamma - 1.0) / nu);

        System.out.printf("Rho: %.6f kg/m³%n", rho);
        System.out.printf("Gamma: %.6f%n", gamma);
        System.out.printf("Mu: %.9f%n", mu);
        System.out.printf("Nu: %.6f%n", nu);
        System.out.printf("Eta: %.9f%n", eta);
        System.out.printf("Wave number at 1 Hz: %.9f rad/m%n", waveNumber1);
        System.out.printf("Alpha constant: %.9f%n", alphaConstant);

        // Test values matching NAF_D_minor_cherry instrument (converted to metres)
        double mpPosition = 0.0043180280;  // 0.17 inches in metres
        double mpBoreDiameter = 0.0295402;  // interpolated bore diameter at mouthpiece
        double windowLength = 0.0043180350;  // 0.17 inches
        double windowWidth = 0.0173736282;  // 0.684 inches
        double fippleFactor = 0.7310016502433632;
        double windwayHeight = 0.0008128031;  // 0.032 inches

        System.out.println("\n=== Mouthpiece Values ===");
        System.out.printf("Position: %.10f m (%.4f mm)%n", mpPosition, mpPosition * 1000);
        System.out.printf("Bore diameter: %.10f m (%.4f mm)%n", mpBoreDiameter, mpBoreDiameter * 1000);
        System.out.printf("Window length: %.10f m (%.4f mm)%n", windowLength, windowLength * 1000);
        System.out.printf("Window width: %.10f m (%.4f mm)%n", windowWidth, windowWidth * 1000);
        System.out.printf("Fipple factor: %.10f%n", fippleFactor);
        System.out.printf("Windway height: %.10f m (%.4f mm)%n", windwayHeight, windwayHeight * 1000);

        // Headspace calculation (simulating Java's bore section approach)
        // First bore point at -0.762mm, mouthpiece at 4.318mm
        double firstBorePos = -0.000762003;  // -0.03 inches in metres
        double hsLength = mpPosition - firstBorePos;  // Total headspace length
        double hsRadius = mpBoreDiameter / 2;
        double hsVolume = Math.PI * hsRadius * hsRadius * hsLength;  // Cylinder approximation

        System.out.println("\n=== Headspace Calculation ===");
        System.out.printf("First bore point position: %.10f m (%.4f mm)%n", firstBorePos, firstBorePos * 1000);
        System.out.printf("Headspace length (Java bore sections): %.10f m (%.4f mm)%n", hsLength, hsLength * 1000);
        System.out.printf("Headspace volume: %.15f m³ (%.4f mm³)%n", hsVolume, hsVolume * 1e9);
        System.out.printf("Headspace volume * 2: %.15f m³%n", hsVolume * 2);

        // Position-based headspace (what TypeScript uses)
        double posBasedVolume = Math.PI * hsRadius * hsRadius * mpPosition;
        System.out.printf("Position-based volume: %.15f m³ (%.4f mm³)%n", posBasedVolume, posBasedVolume * 1e9);
        System.out.printf("Position-based * 2: %.15f m³%n", posBasedVolume * 2);
        System.out.printf("Bore-section / Position-based ratio: %.6f%n", hsVolume / posBasedVolume);

        // Test frequency: D4 at 289.42 Hz
        double freq = 289.42;
        double omega = 2 * Math.PI * freq;
        double waveNumber = waveNumber1 * freq;
        double radius = mpBoreDiameter / 2;
        double z0 = rho * speedOfSound / (Math.PI * radius * radius);

        System.out.println("\n=== Calculation at 289.42 Hz ===");
        System.out.printf("Frequency: %.2f Hz%n", freq);
        System.out.printf("Omega: %.6f rad/s%n", omega);
        System.out.printf("Wave number: %.6f rad/m%n", waveNumber);
        System.out.printf("z0: %.4f%n", z0);

        // Characteristic length calculation
        double effectiveArea = windowLength * windowWidth;
        double ratio = Math.pow(DEFAULT_WINDWAY_HEIGHT / windwayHeight, 1.0 / 3.0);
        double scaledFippleFactor = fippleFactor * ratio;
        double equivDiameter = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;

        System.out.println("\n=== Fipple Calculations ===");
        System.out.printf("Effective area: %.15f m² (%.4f mm²)%n", effectiveArea, effectiveArea * 1e6);
        System.out.printf("Windway height ratio: %.10f%n", ratio);
        System.out.printf("Scaled fipple factor: %.10f%n", scaledFippleFactor);
        System.out.printf("Equivalent diameter (characteristic length): %.10f m (%.4f mm)%n", equivDiameter, equivDiameter * 1000);

        // JYE calculation
        double JYE = equivDiameter / (AIR_GAMMA * omega);
        System.out.printf("JYE: %.15e%n", JYE);

        // JYC calculation (using bore-section headspace like Java)
        double v_boresection = 2.0 * hsVolume * 2.0;  // *2 inside, *2 outside
        double JYC_boresection = -(omega * v_boresection) / (AIR_GAMMA * speedOfSound * speedOfSound);
        System.out.printf("JYC (bore-section): %.15e%n", JYC_boresection);

        // JYC calculation (using position-based headspace like TypeScript)
        double v_position = 2.0 * posBasedVolume * 2.0;
        double JYC_position = -(omega * v_position) / (AIR_GAMMA * speedOfSound * speedOfSound);
        System.out.printf("JYC (position-based): %.15e%n", JYC_position);

        // k_delta_l
        double k_delta_l_bore = Math.atan(1.0 / (z0 * (JYE + JYC_boresection)));
        double k_delta_l_pos = Math.atan(1.0 / (z0 * (JYE + JYC_position)));
        System.out.println("\n=== k_delta_l ===");
        System.out.printf("JYE + JYC (bore-section): %.15e%n", JYE + JYC_boresection);
        System.out.printf("JYE + JYC (position-based): %.15e%n", JYE + JYC_position);
        System.out.printf("k_delta_l (bore-section): %.10f rad (%.4f deg)%n", k_delta_l_bore, Math.toDegrees(k_delta_l_bore));
        System.out.printf("k_delta_l (position-based): %.10f rad (%.4f deg)%n", k_delta_l_pos, Math.toDegrees(k_delta_l_pos));

        // Transfer matrix elements (using position-based for comparison with TypeScript)
        double cos_kl = Math.cos(k_delta_l_pos);
        double sin_kl = Math.sin(k_delta_l_pos);
        double r_rad = calcR(freq, radius, rho, speedOfSound, eta, gamma, nu);

        System.out.println("\n=== Transfer Matrix (position-based) ===");
        System.out.printf("cos(k_delta_l): %.10f%n", cos_kl);
        System.out.printf("sin(k_delta_l): %.10f%n", sin_kl);
        System.out.printf("r_rad: %.10f%n", r_rad);

        Complex A = new Complex(cos_kl, r_rad * sin_kl / z0);
        Complex B = Complex.I.multiply(sin_kl * z0).add(r_rad * cos_kl);
        Complex C = Complex.I.multiply(sin_kl / z0);
        Complex D = new Complex(cos_kl);

        System.out.printf("A: (%.10f, %.10f)%n", A.getReal(), A.getImaginary());
        System.out.printf("B: (%.10f, %.10f)%n", B.getReal(), B.getImaginary());
        System.out.printf("C: (%.10f, %.10f)%n", C.getReal(), C.getImaginary());
        System.out.printf("D: (%.10f, %.10f)%n", D.getReal(), D.getImaginary());
    }

    /**
     * Yang Yili speed of sound formula.
     */
    private static double calculateSpeedOfSound(double ambientTemp, double relativeHumidity) {
        double p = 101000.0;
        double[] a = {331.5024, 0.603055, -0.000528, 51.471935,
                0.1495874, -0.000782, -1.82e-7, 3.73e-8,
                -2.93e-10, -85.20931, -0.228525, 5.91e-5,
                -2.835149, -2.15e-13, 29.179762, 0.000486};

        double T = ambientTemp + 273.15;
        double f = 1.00062 + 0.0000000314 * p + 0.00000056 * ambientTemp * ambientTemp;
        double Psv = Math.exp(0.000012811805 * T * T - 0.019509874 * T + 34.04926034 - 6353.6311 / T);
        double Xw = relativeHumidity * f * Psv / p;
        double c = 331.45 - a[0] - p * a[6] - a[13] * p * p;
        c = Math.sqrt(a[9] * a[9] + 4 * a[14] * c);
        double Xc = (-a[9] - c) / (2.0 * a[14]);

        return a[0] + a[1] * ambientTemp + a[2] * ambientTemp * ambientTemp
                + (a[3] + a[4] * ambientTemp + a[5] * ambientTemp * ambientTemp) * Xw
                + (a[6] + a[7] * ambientTemp + a[8] * ambientTemp * ambientTemp) * p
                + (a[9] + a[10] * ambientTemp + a[11] * ambientTemp * ambientTemp) * Xc
                + a[12] * Xw * Xw + a[13] * p * p + a[14] * Xc * Xc + a[15] * Xw * p * Xc;
    }

    /**
     * Calculate radiation resistance (from Tube.calcR using Silva formula).
     */
    private static double calcR(double freq, double radius, double rho, double c, double eta, double gamma, double nu) {
        double omega = 2.0 * Math.PI * freq;
        double wave_number = omega / c;
        double ka = wave_number * radius;
        double ka2 = ka * ka;
        double Z0 = rho * c / (Math.PI * radius * radius);
        // Silva formula for flanged open end
        return Z0 * ka2 * (0.5 + 0.1053 * ka2) / (1.0 + ka2 * (0.358 + 0.1053 * ka2));
    }
}
