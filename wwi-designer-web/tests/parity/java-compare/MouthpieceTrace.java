/**
 * Trace mouthpiece calculator values in Java for comparison with TypeScript.
 *
 * Values from NAF_D_minor_cherry_actual_geometry.xml (already converted to metres):
 */
public class MouthpieceTrace {

    static final double AIR_GAMMA = 1.4018297351222222;
    static final double DEFAULT_WINDWAY_HEIGHT = 0.00078740;
    static final double INCH_TO_METRE = 0.0254;

    // From XML (in inches)
    static final double MP_POSITION_IN = 0.1700011016032717;
    static final double FIRST_BORE_POS_IN = -0.030000113400183714;
    static final double FIRST_BORE_DIAMETER_IN = 1.1630018840610175;
    static final double WINDOW_LENGTH_IN = 0.17000137700520504;
    static final double WINDOW_WIDTH_IN = 0.6840011080805983;
    static final double FIPPLE_FACTOR = 0.7310016502433632;
    static final double WINDWAY_HEIGHT_IN = 0.03200012096019596;

    static double getSectionVolume(double length, double leftRadius, double rightRadius) {
        return Math.PI * length / 3.0 *
               (leftRadius * leftRadius + leftRadius * rightRadius + rightRadius * rightRadius);
    }

    static double calculateSpeedOfSound(double tempC) {
        double relativeHumidity = 0.45;
        double p = 101000;
        double[] a = new double[] { 331.5024, 0.603055, -0.000528, 51.471935,
                0.1495874, -0.000782, -1.82e-7, 3.73e-8, -2.93e-10, -85.20931,
                -0.228525, 5.91e-5, -2.835149, -2.15e-13, 29.179762, 0.000486 };

        double T = tempC + 273.15;
        double f = 1.00062 + 0.0000000314 * p + 0.00000056 * tempC * tempC;
        double Psv = Math.exp(0.000012811805 * T * T - 0.019509874 * T + 34.04926034 - 6353.6311 / T);
        double Xw = relativeHumidity * f * Psv / p;
        double c = 331.45 - a[0] - p * a[6] - a[13] * p * p;
        c = Math.sqrt(a[9] * a[9] + 4 * a[14] * c);
        double Xc = (-a[9] - c) / (2 * a[14]);

        return a[0] + a[1] * tempC + a[2] * tempC * tempC
                + (a[3] + a[4] * tempC + a[5] * tempC * tempC) * Xw
                + (a[6] + a[7] * tempC + a[8] * tempC * tempC) * p
                + (a[9] + a[10] * tempC + a[11] * tempC * tempC) * Xc
                + a[12] * Xw * Xw + a[13] * p * p + a[14] * Xc * Xc + a[15] * Xw * p * Xc;
    }

    public static void main(String[] args) {
        System.out.println("=== Java Mouthpiece Calculator Trace ===\n");

        // Convert to metres
        double mpPosition = MP_POSITION_IN * INCH_TO_METRE;
        double firstBorePos = FIRST_BORE_POS_IN * INCH_TO_METRE;
        double boreDiameter = FIRST_BORE_DIAMETER_IN * INCH_TO_METRE;
        double radius = boreDiameter / 2;

        double windowLength = WINDOW_LENGTH_IN * INCH_TO_METRE;
        double windowWidth = WINDOW_WIDTH_IN * INCH_TO_METRE;
        double windwayHeight = WINDWAY_HEIGHT_IN * INCH_TO_METRE;

        // Temperature: 72°F = 22.22°C
        double tempC = (72 + 40) * 5.0 / 9.0 - 40;
        double speedOfSound = calculateSpeedOfSound(tempC);

        // SimplePhysicalParameters values
        double deltaT = tempC - 26.85;
        double rho = 1.1769 * (1.0 - 0.00335 * deltaT);

        System.out.println("=== Physical Parameters ===");
        System.out.println("Temperature: 72°F = " + tempC + "°C");
        System.out.println("SimplePhysicalParameters.getSpeedOfSound(): " + speedOfSound);
        System.out.println("SimplePhysicalParameters.getRho(): " + rho);
        System.out.println("AIR_GAMMA (hardcoded): " + AIR_GAMMA);

        System.out.println("\n=== Mouthpiece (in metres) ===");
        System.out.println("Position: " + mpPosition + " m");
        System.out.println("Bore diameter: " + boreDiameter + " m");
        System.out.println("Bore radius: " + radius + " m");

        System.out.println("\n=== Fipple (in metres) ===");
        System.out.println("Window length: " + windowLength + " m");
        System.out.println("Window width: " + windowWidth + " m");
        System.out.println("Windway height: " + windwayHeight + " m");
        System.out.println("Fipple factor: " + FIPPLE_FACTOR);

        // Calculate characteristic length
        double ratio = Math.pow(DEFAULT_WINDWAY_HEIGHT / windwayHeight, 1.0 / 3.0);
        double scaledFippleFactor = FIPPLE_FACTOR * ratio;
        double effectiveArea = windowLength * windowWidth;
        double characteristicLength = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;

        System.out.println("\n=== Characteristic Length Calculation ===");
        System.out.println("DEFAULT_WINDWAY_HEIGHT: " + DEFAULT_WINDWAY_HEIGHT + " m");
        System.out.println("windwayHeight/DEFAULT ratio: " + (windwayHeight / DEFAULT_WINDWAY_HEIGHT));
        System.out.println("ratio (cube root): " + ratio);
        System.out.println("scaledFippleFactor: " + scaledFippleFactor);
        System.out.println("effectiveArea: " + effectiveArea + " m²");
        System.out.println("characteristicLength: " + characteristicLength + " m");

        // Headspace volume
        double boreSectionLength = mpPosition - firstBorePos;
        double boreSectionVolume = getSectionVolume(boreSectionLength, radius, radius);

        System.out.println("\n=== Headspace Volume ===");
        System.out.println("Section: length=" + boreSectionLength + " m, leftR=" + radius + ", rightR=" + radius + ", vol=" + boreSectionVolume);
        System.out.println("calcHeadspaceVolume return (volume * 2.0): " + (boreSectionVolume * 2.0) + " m³");

        // For D4 = 289.42 Hz
        double targetFreq = 289.42;
        double omega = 2 * Math.PI * targetFreq;
        double z0 = rho * speedOfSound / (Math.PI * radius * radius);
        double v = 2.0 * (boreSectionVolume * 2.0);

        System.out.println("\n=== JYE and JYC Calculation (for D4 = 289.42 Hz) ===");
        System.out.println("omega = 2π * " + targetFreq + " = " + omega);
        System.out.println("z0 = " + z0);
        System.out.println("v (2 * calcHeadspaceVolume) = " + v + " m³");

        double JYE = characteristicLength / (AIR_GAMMA * omega);
        double JYC = -(omega * v) / (AIR_GAMMA * speedOfSound * speedOfSound);

        System.out.println("\nJYE = characteristicLength / (gamma * omega)");
        System.out.println("    = " + characteristicLength + " / (" + AIR_GAMMA + " * " + omega + ")");
        System.out.println("    = " + JYE);

        System.out.println("\nJYC = -(omega * v) / (gamma * c²)");
        System.out.println("    = -(" + omega + " * " + v + ") / (" + AIR_GAMMA + " * " + speedOfSound + "²)");
        System.out.println("    = " + JYC);

        System.out.println("\nJYE + JYC = " + (JYE + JYC));

        double k_delta_l = Math.atan(1.0 / (z0 * (JYE + JYC)));
        System.out.println("\nk_delta_l = atan(1 / (z0 * (JYE + JYC)))");
        System.out.println("          = atan(1 / (" + z0 + " * " + (JYE + JYC) + "))");
        System.out.println("          = " + k_delta_l);

        // Radiation resistance
        double ka = omega / speedOfSound * radius;
        double r_rad = (rho * speedOfSound / (Math.PI * radius * radius)) * ka * ka / 4;
        System.out.println("\nr_rad calculation:");
        System.out.println("  ka = " + ka);
        System.out.println("  r_rad = " + r_rad);

        // Transfer matrix elements
        double cos_kl = Math.cos(k_delta_l);
        double sin_kl = Math.sin(k_delta_l);

        System.out.println("\n=== Transfer Matrix Elements ===");
        System.out.println("cos(k_delta_l) = " + cos_kl);
        System.out.println("sin(k_delta_l) = " + sin_kl);
        System.out.println("A = (" + cos_kl + ", " + (r_rad * sin_kl / z0) + ")");
        System.out.println("B = (" + (r_rad * cos_kl) + ", " + (sin_kl * z0) + ")");
        System.out.println("C = (0, " + (sin_kl / z0) + ")");
        System.out.println("D = (" + cos_kl + ", 0)");
    }
}
