/**
 * Standalone Java program to output prediction values for comparison with TypeScript.
 * Compiles with commons-math3 only.
 */
// Standalone - no dependencies needed

public class JavaPredictions {

    private static final double DEFAULT_WINDWAY_HEIGHT = 0.00078740;
    private static final double AIR_GAMMA = 1.4018297351222222;

    // Physical parameters (72°F, ASHRAE model)
    // From SimplePhysicalParameters (Yang Yili formula)
    private static double calcSpeedOfSound(double tempC) {
        double kelvin = tempC + 273.15;
        double gammaw = 1.4018297351222222;
        double Rw = 8314.462618 / 28.965;  // Dry air molar mass
        double c0 = Math.sqrt(gammaw * Rw * kelvin);
        // Apply humidity correction (45% default)
        double humidity = 0.45;
        double es = 6.1078 * Math.pow(10.0, (7.5 * tempC) / (tempC + 237.3));
        double ew = es * humidity;
        double xw = ew / 1013.25;  // mole fraction of water vapor at 1 atm
        double correction = Math.sqrt(1.0 + (0.378 * xw));  // Approximation
        return c0;
    }

    public static void main(String[] args) {
        // From the actual NAF_D_minor_cherry values converted to metres
        double tempF = 72.0;
        double tempC = (tempF + 40.0) * 5.0 / 9.0 - 40.0;

        // From SimplePhysicalParameters calculation
        double c = 344.751958;  // Speed of sound from Yang Yili formula at 72°F
        double rho = 1.186119;  // Air density at 72°F

        // Mouthpiece values
        double mpPosition = 0.0043180280;  // 0.17" in metres
        double mpBoreDiameter = 0.0295402;  // From first bore point
        double windowLength = 0.0043180350;  // 0.17" in metres
        double windowWidth = 0.0173736282;  // From XML
        double fippleFactor = 0.7310016502433632;
        double windwayHeight = 0.0008128031;  // 0.032" in metres

        // Headspace: Java iterates over mouthpiece.getHeadspace() bore sections
        // From the XML, there is one bore section from position -0.762mm to 0 (length 0.762mm)
        // But mouthpiece position is 4.318mm, so headspace = 0 to 4.318mm
        // Actually, headspace is from first bore point to mouthpiece position
        double firstBorePos = -0.000762003;  // -0.030" in metres
        double hsLength = mpPosition - firstBorePos;  // 5.08mm
        double hsRadius = mpBoreDiameter / 2;

        // Volume using bore section (cylindrical, left and right radius same)
        double hsVolume = Math.PI * hsRadius * hsRadius * hsLength;

        System.out.println("=== Java Predictions (Mouthpiece Calculator) ===\n");
        System.out.println("Temperature: " + tempF + "°F = " + String.format("%.6f", tempC) + "°C");
        System.out.println("Speed of sound: " + c + " m/s");
        System.out.println("Air density: " + rho + " kg/m³");

        System.out.println("\n=== Mouthpiece Values ===");
        System.out.println("Position: " + String.format("%.10f", mpPosition) + " m");
        System.out.println("Bore diameter: " + String.format("%.10f", mpBoreDiameter) + " m");
        System.out.println("Window length: " + String.format("%.10f", windowLength) + " m");
        System.out.println("Window width: " + String.format("%.10f", windowWidth) + " m");
        System.out.println("Fipple factor: " + String.format("%.10f", fippleFactor));
        System.out.println("Windway height: " + String.format("%.10f", windwayHeight) + " m");

        System.out.println("\n=== Headspace (bore-section style) ===");
        System.out.println("First bore point: " + String.format("%.10f", firstBorePos) + " m");
        System.out.println("Headspace length: " + String.format("%.10f", hsLength) + " m");
        System.out.println("Headspace volume: " + String.format("%.15e", hsVolume) + " m³");
        System.out.println("Headspace volume * 2 (calcHeadspaceVolume return): " + String.format("%.15e", hsVolume * 2) + " m³");

        // Test at D4 = 289.42 Hz
        double freq = 289.42;
        double omega = 2 * Math.PI * freq;
        double radius = mpBoreDiameter / 2;
        double z0 = rho * c / (Math.PI * radius * radius);

        System.out.println("\n=== Calculation at " + freq + " Hz ===");
        System.out.println("Omega: " + String.format("%.6f", omega) + " rad/s");
        System.out.println("z0: " + String.format("%.4f", z0));

        // JYE calculation
        double effectiveArea = windowLength * windowWidth;
        double ratio = Math.pow(DEFAULT_WINDWAY_HEIGHT / windwayHeight, 1.0 / 3.0);
        double scaledFippleFactor = fippleFactor * ratio;
        double charLength = 2.0 * Math.sqrt(effectiveArea / Math.PI) * scaledFippleFactor;
        double JYE = charLength / (AIR_GAMMA * omega);

        System.out.println("\n=== JYE Calculation ===");
        System.out.println("Effective area: " + String.format("%.15e", effectiveArea));
        System.out.println("Windway ratio: " + String.format("%.10f", ratio));
        System.out.println("Scaled fipple factor: " + String.format("%.10f", scaledFippleFactor));
        System.out.println("Characteristic length: " + String.format("%.10f", charLength) + " m");
        System.out.println("JYE: " + String.format("%.15e", JYE));

        // JYC calculation (bore-section based)
        double v = 2.0 * (hsVolume * 2.0);  // v = 2 * calcHeadspaceVolume()
        double JYC = -(omega * v) / (AIR_GAMMA * c * c);

        System.out.println("\n=== JYC Calculation (bore-section) ===");
        System.out.println("v (2 * headspaceVolume * 2): " + String.format("%.15e", v));
        System.out.println("JYC: " + String.format("%.15e", JYC));

        // k_delta_l
        double k_delta_l = Math.atan(1.0 / (z0 * (JYE + JYC)));
        System.out.println("\n=== k_delta_l ===");
        System.out.println("JYE + JYC: " + String.format("%.15e", JYE + JYC));
        System.out.println("z0 * (JYE + JYC): " + String.format("%.15e", z0 * (JYE + JYC)));
        System.out.println("k_delta_l: " + String.format("%.10f", k_delta_l) + " rad (" +
            String.format("%.4f", k_delta_l * 180 / Math.PI) + " deg)");

        // Also compute with position-based for comparison
        double posVolume = Math.PI * radius * radius * mpPosition;
        double v_pos = 2.0 * (posVolume * 2.0);
        double JYC_pos = -(omega * v_pos) / (AIR_GAMMA * c * c);
        double k_delta_l_pos = Math.atan(1.0 / (z0 * (JYE + JYC_pos)));

        System.out.println("\n=== Position-based comparison ===");
        System.out.println("Position-based volume: " + String.format("%.15e", posVolume));
        System.out.println("JYC (position): " + String.format("%.15e", JYC_pos));
        System.out.println("k_delta_l (position): " + String.format("%.10f", k_delta_l_pos) + " rad (" +
            String.format("%.4f", k_delta_l_pos * 180 / Math.PI) + " deg)");

        System.out.println("\n=== Difference ===");
        System.out.println("k_delta_l diff: " + String.format("%.10f", k_delta_l - k_delta_l_pos) + " rad");
        System.out.println("              = " + String.format("%.4f", (k_delta_l - k_delta_l_pos) * 180 / Math.PI) + " deg");
    }
}
