/**
 * Standalone test to verify Yang Yili speed of sound calculation.
 * This is a direct copy of the formula from SimplePhysicalParameters.java
 * with no external dependencies.
 *
 * Compile and run with: javac SpeedOfSoundTest.java && java SpeedOfSoundTest
 */
public class SpeedOfSoundTest {

    private static final double RELATIVE_HUMIDITY = 0.45;

    public static double calculateSpeedOfSound(double ambientTemp, double relativeHumidity) {
        double T;
        double f;
        double Psv;
        double Xw;
        double c;
        double Xc;
        double speed;
        double p = 101000d;
        double[] a = new double[] { 331.5024d, 0.603055d, -0.000528d, 51.471935d,
                0.1495874d, -0.000782d, -1.82e-7d, 3.73e-8d, -2.93e-10d, -85.20931d,
                -0.228525d, 5.91e-5d, -2.835149d, -2.15e-13d, 29.179762d, 0.000486d };

        T = ambientTemp + 273.15d;
        f = 1.00062d + 0.0000000314d * p + 0.00000056d * ambientTemp * ambientTemp;
        Psv = Math.exp(0.000012811805d * T * T - 0.019509874d * T + 34.04926034d
                - 6353.6311d / T);
        Xw = relativeHumidity * f * Psv / p;
        c = 331.45d - a[0] - p * a[6] - a[13] * p * p;
        c = Math.sqrt(a[9] * a[9] + 4 * a[14] * c);
        Xc = (-a[9] - c) / (2. * a[14]);

        speed = a[0]
                + a[1]
                * ambientTemp
                + a[2]
                * ambientTemp
                * ambientTemp
                + (a[3] + a[4] * ambientTemp + a[5] * ambientTemp * ambientTemp)
                * Xw
                + (a[6] + a[7] * ambientTemp + a[8] * ambientTemp * ambientTemp)
                * p
                + (a[9] + a[10] * ambientTemp + a[11] * ambientTemp
                        * ambientTemp) * Xc + a[12] * Xw * Xw + a[13] * p * p
                + a[14] * Xc * Xc + a[15] * Xw * p * Xc;

        return speed;
    }

    public static void main(String[] args) {
        // Convert 72°F to Celsius (Java's temperature conversion)
        double tempF = 72.0;
        double tempC = (tempF + 40.0) * 5.0 / 9.0 - 40.0;

        System.out.println("=== Yang Yili Speed of Sound Test (Java) ===\n");
        System.out.println("Temperature: " + tempF + "°F = " + tempC + "°C");
        System.out.println("Relative humidity: " + RELATIVE_HUMIDITY);

        double speed = calculateSpeedOfSound(tempC, RELATIVE_HUMIDITY);
        System.out.println("\nSpeed of sound: " + speed + " m/s");

        // Also show intermediate values for comparison
        double T = tempC + 273.15;
        double p = 101000;
        double f = 1.00062 + 0.0000000314 * p + 0.00000056 * tempC * tempC;
        double Psv = Math.exp(0.000012811805 * T * T - 0.019509874 * T + 34.04926034 - 6353.6311 / T);
        double Xw = RELATIVE_HUMIDITY * f * Psv / p;

        double[] a = new double[] { 331.5024, 0.603055, -0.000528, 51.471935,
                0.1495874, -0.000782, -1.82e-7, 3.73e-8, -2.93e-10, -85.20931,
                -0.228525, 5.91e-5, -2.835149, -2.15e-13, 29.179762, 0.000486 };

        double c = 331.45 - a[0] - p * a[6] - a[13] * p * p;
        c = Math.sqrt(a[9] * a[9] + 4 * a[14] * c);
        double Xc = (-a[9] - c) / (2 * a[14]);

        System.out.println("\n=== Intermediate Values ===");
        System.out.println("T (Kelvin): " + T);
        System.out.println("f: " + f);
        System.out.println("Psv: " + Psv);
        System.out.println("Xw: " + Xw);
        System.out.println("Xc: " + Xc);

        // Other parameters used by SimplePhysicalParameters
        double deltaT = tempC - 26.85;
        double rho = 1.1769 * (1.0 - 0.00335 * deltaT);
        double gamma = 1.4017 * (1.0 - 0.00002 * deltaT);

        System.out.println("\n=== Other Parameters ===");
        System.out.println("deltaT: " + deltaT);
        System.out.println("rho: " + rho);
        System.out.println("gamma: " + gamma);
    }
}
