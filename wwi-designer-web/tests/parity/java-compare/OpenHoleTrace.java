/**
 * Trace open hole calculation in Java for comparison with TypeScript.
 *
 * Hole 6 from NAF_D_minor_cherry_actual_geometry.xml (values in inches, converted to metres):
 * - Hole diameter: 0.25 in = 0.00635 m
 * - Hole height: 0.18500108324295592 in = 0.00469902751437108 m
 * - Bore diameter: 1.1630018840610175 in = 0.029540247855149842 m
 */
public class OpenHoleTrace {

    static final double INCH_TO_METRE = 0.0254;

    // Hole 6 values from XML
    static final double HOLE_DIAMETER_IN = 0.25;
    static final double HOLE_HEIGHT_IN = 0.18500108324295592;
    static final double BORE_DIAMETER_IN = 1.1630018840610175;

    // Physical parameters at 72°F
    static final double SPEED_OF_SOUND = 345.30996202562744;
    static final double RHO = 1.1951455460833333;

    // NAF calculator setting
    static final double HOLE_SIZE_MULT = 0.9605;

    public static void main(String[] args) {
        System.out.println("=== Java Open Hole Calculation Trace (Hole 6) ===\n");

        // Convert to metres
        double holeDiameter = HOLE_DIAMETER_IN * INCH_TO_METRE;
        double holeHeight = HOLE_HEIGHT_IN * INCH_TO_METRE;
        double boreDiameter = BORE_DIAMETER_IN * INCH_TO_METRE;

        System.out.println("=== Hole Parameters (in metres) ===");
        System.out.println("Hole diameter: " + holeDiameter + " m");
        System.out.println("Hole height: " + holeHeight + " m");
        System.out.println("Bore diameter at hole: " + boreDiameter + " m");

        // Calculate for F4 = 331.14 Hz
        double freq = 331.14;
        double waveNumber = (2 * Math.PI * freq) / SPEED_OF_SOUND;

        System.out.println("\n=== At frequency " + freq + " Hz ===");
        System.out.println("Wave number: " + waveNumber);

        // Hole calculator values
        double radius = HOLE_SIZE_MULT * holeDiameter / 2;
        double boreRadius = boreDiameter / 2;
        double Z0h = (RHO * SPEED_OF_SOUND) / (Math.PI * radius * radius);

        System.out.println("\n=== Hole Calculator Values ===");
        System.out.println("radius (with mult): " + radius);
        System.out.println("boreRadius: " + boreRadius);
        System.out.println("Z0h: " + Z0h);

        double delta = radius / boreRadius;
        double delta2 = delta * delta;

        System.out.println("delta: " + delta);
        System.out.println("delta2: " + delta2);

        // Equation 8
        double tm = 0.125 * radius * delta * (1.0 + 0.207 * delta * delta2);
        double te = holeHeight + tm;

        System.out.println("\n=== te calculation ===");
        System.out.println("tm (eq 8): " + tm);
        System.out.println("te = height + tm: " + te);

        // ti_base (Equation 31)
        double ti_base = radius * (0.822 + delta * (-0.095 + delta * (-1.566 +
            delta * (2.138 + delta * (-1.640 + delta * 0.502)))));

        System.out.println("ti_base (eq 31): " + ti_base);

        // Open hole calculations
        double kb = waveNumber * radius;
        double ka = waveNumber * boreRadius;

        System.out.println("\n=== Open hole values ===");
        System.out.println("kb: " + kb);
        System.out.println("ka: " + ka);

        // Equation 33
        double ta = (-0.35 + 0.06 * Math.tanh((2.7 * holeHeight) / radius)) * radius * delta2;
        System.out.println("ta (eq 33): " + ta);

        // Equation 31 * 32
        double ti = ti_base * (1.0 + (1.0 - 4.56 * delta + 6.55 * delta2) *
            ka * (0.17 + ka * (0.92 + ka * (0.16 - 0.29 * ka))));
        System.out.println("ti (eq 31*32): " + ti);

        // Radiation resistance
        double Rr = 0.25 * kb * kb;
        System.out.println("Rr: " + Rr);

        // tr (equation 11 * radius)
        double outerRadius = radius / (boreRadius + holeHeight);
        double tr = radius * (0.822 - 0.47 * Math.pow(outerRadius, 0.8));
        System.out.println("outerRadius ratio: " + outerRadius);
        System.out.println("tr (eq 11): " + tr);

        // kttotal
        double kttotal = waveNumber * ti + Math.tan(waveNumber * (te + tr));
        System.out.println("\n=== Final calculation ===");
        System.out.println("waveNumber * ti: " + (waveNumber * ti));
        System.out.println("waveNumber * (te + tr): " + (waveNumber * (te + tr)));
        System.out.println("tan(waveNumber * (te + tr)): " + Math.tan(waveNumber * (te + tr)));
        System.out.println("kttotal: " + kttotal);

        // Ys (shunt admittance)
        // Ys = 1 / ((j*kttotal + Rr) * Z0h)
        double denom_re = Rr * Z0h;
        double denom_im = kttotal * Z0h;
        double denom_mag2 = denom_re * denom_re + denom_im * denom_im;
        double Ys_re = denom_re / denom_mag2;
        double Ys_im = -denom_im / denom_mag2;

        System.out.println("\nYs denominator (Rr*Z0h, kttotal*Z0h): (" + denom_re + ", " + denom_im + ")");
        System.out.println("Ys: (" + Ys_re + ", " + Ys_im + ")");

        // Za (series impedance)
        double Za_im = Z0h * delta2 * waveNumber * ta;
        System.out.println("Za: (0, " + Za_im + ")");

        // Transfer matrix elements
        // Za_Zs = Za * Ys
        double Za_Zs_re = -Za_im * Ys_im;
        double Za_Zs_im = Za_im * Ys_re;

        System.out.println("\nZa_Zs: (" + Za_Zs_re + ", " + Za_Zs_im + ")");

        // A = Za_Zs/2 + 1
        double A_re = Za_Zs_re / 2 + 1;
        double A_im = Za_Zs_im / 2;
        System.out.println("A = Za_Zs/2 + 1: (" + A_re + ", " + A_im + ")");

        // B = Za * (Za_Zs/4 + 1)
        double B_factor_re = Za_Zs_re / 4 + 1;
        double B_factor_im = Za_Zs_im / 4;
        double B_re = -Za_im * B_factor_im;
        double B_im = Za_im * B_factor_re;
        System.out.println("B = Za*(Za_Zs/4+1): (" + B_re + ", " + B_im + ")");

        System.out.println("\n=== Transfer Matrix (open hole) ===");
        System.out.println("A: (" + A_re + ", " + A_im + ")");
        System.out.println("B: (" + B_re + ", " + B_im + ")");
        System.out.println("C: (" + Ys_re + ", " + Ys_im + ")");
        System.out.println("D: (" + A_re + ", " + A_im + ")");
    }
}
