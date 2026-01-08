/**
 * Verify headspace volume calculation between position-based and bore-section-based.
 *
 * From NAF_D_minor_cherry_actual_geometry.xml (values in inches):
 * - Mouthpiece position: 0.1700011016032717 in
 * - First bore point: -0.030000113400183714 in, diameter 1.1630018840610175 in
 * - Second bore point: 8.700014094007608 in, diameter 1.1630018840610175 in
 *
 * The bore is cylindrical from -0.03 to 8.7, so radius at mouthpiece = 1.163/2
 */
public class HeadspaceVolumeTest {

    // Values in inches from XML
    static final double MP_POSITION = 0.1700011016032717;
    static final double FIRST_BORE_POS = -0.030000113400183714;
    static final double FIRST_BORE_DIAMETER = 1.1630018840610175;

    // Convert to metres
    static final double INCH_TO_METRE = 0.0254;

    public static double getSectionVolume(double length, double leftRadius, double rightRadius) {
        // Frustum formula: V = (π * h / 3) * (r1² + r1*r2 + r2²)
        return Math.PI * length / 3.0 *
               (leftRadius * leftRadius + leftRadius * rightRadius + rightRadius * rightRadius);
    }

    public static void main(String[] args) {
        System.out.println("=== Headspace Volume Comparison ===\n");

        // Convert to metres
        double mpPosition_m = MP_POSITION * INCH_TO_METRE;
        double firstBorePos_m = FIRST_BORE_POS * INCH_TO_METRE;
        double boreDiameter_m = FIRST_BORE_DIAMETER * INCH_TO_METRE;
        double radius_m = boreDiameter_m / 2;

        System.out.println("Values in metres:");
        System.out.println("  Mouthpiece position: " + mpPosition_m);
        System.out.println("  First bore position: " + firstBorePos_m);
        System.out.println("  Bore diameter: " + boreDiameter_m);
        System.out.println("  Bore radius: " + radius_m);

        // Position-based (TypeScript current approach)
        // Uses mouthpiece.position as length (from 0 to mouthpiece position)
        double positionLength = mpPosition_m;
        double positionVolume = Math.PI * radius_m * radius_m * positionLength;
        System.out.println("\n=== Position-Based Calculation ===");
        System.out.println("  Length (0 to mp): " + positionLength + " m");
        System.out.println("  Base volume: " + positionVolume + " m³");
        System.out.println("  * 2.0 (Java multiplier): " + (positionVolume * 2.0) + " m³");

        // Bore-section based (Java approach)
        // Uses bore section from first bore point to mouthpiece position
        double boreSectionLength = mpPosition_m - firstBorePos_m;
        double boreSectionVolume = getSectionVolume(boreSectionLength, radius_m, radius_m);
        System.out.println("\n=== Bore-Section-Based Calculation ===");
        System.out.println("  Length (first bore to mp): " + boreSectionLength + " m");
        System.out.println("  Section volume: " + boreSectionVolume + " m³");
        System.out.println("  * 2.0 (Java multiplier): " + (boreSectionVolume * 2.0) + " m³");

        // Ratio
        System.out.println("\n=== Comparison ===");
        System.out.println("  Bore-section / Position ratio: " + (boreSectionVolume / positionVolume));
        System.out.println("  Bore-section length / Position length ratio: " + (boreSectionLength / positionLength));

        // What Java actually uses in calcJYC
        // calcJYC uses: v = 2. * calcHeadspaceVolume(mouthpiece)
        // where calcHeadspaceVolume returns volume * 2.0
        // So total v = 4 * raw_volume
        System.out.println("\n=== Java calcJYC input (v = 2 * calcHeadspaceVolume) ===");
        System.out.println("  Position-based v: " + (positionVolume * 2.0 * 2.0) + " m³");
        System.out.println("  Bore-section v: " + (boreSectionVolume * 2.0 * 2.0) + " m³");
    }
}
