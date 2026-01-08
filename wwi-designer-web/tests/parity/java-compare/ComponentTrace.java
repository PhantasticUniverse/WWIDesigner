/**
 * Trace component list in Java for comparison with TypeScript.
 *
 * Compile and run in wwi-designer-web/tests/parity/java-compare:
 * WIJAR="/home/user/WWIDesigner/WWIDesigner/releases/1/WIDesigner-1.1.0.jar"
 * MATHJAR="/home/user/WWIDesigner/WWIDesigner/releases/1/lib-1.1/commons-math3-3.5.jar"
 * javac -cp ".:${WIJAR}:${MATHJAR}" ComponentTrace.java
 * java -cp ".:${WIJAR}:${MATHJAR}" ComponentTrace
 */

import com.wwidesigner.geometry.Instrument;
import com.wwidesigner.geometry.Mouthpiece;
import com.wwidesigner.geometry.Hole;
import com.wwidesigner.geometry.BorePoint;
import com.wwidesigner.geometry.BoreSection;
import com.wwidesigner.geometry.Termination;
import com.wwidesigner.geometry.ComponentInterface;
import com.wwidesigner.note.Fingering;
import com.wwidesigner.note.Note;
import com.wwidesigner.note.Tuning;
import com.wwidesigner.modelling.NAFCalculator;
import com.wwidesigner.modelling.InstrumentCalculator;
import com.wwidesigner.modelling.SimpleInstrumentTuner;
import com.wwidesigner.util.Constants.TemperatureType;
import com.wwidesigner.util.PhysicalParameters;
import org.apache.commons.math3.complex.Complex;

import java.util.List;

public class ComponentTrace {

    private static String instrumentFile = "/home/user/WWIDesigner/wwi-designer-web/tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_geometry.xml";
    private static String tuningFile = "/home/user/WWIDesigner/wwi-designer-web/tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_tuning.xml";

    public static void main(String[] args) throws Exception {
        System.out.println("=== Component List Trace (Java) ===\n");

        // Load instrument and tuning using SimpleInstrumentTuner
        SimpleInstrumentTuner tuner = new SimpleInstrumentTuner();
        tuner.setInstrument(instrumentFile, false);
        tuner.setTuning(tuningFile, false);

        PhysicalParameters params = new PhysicalParameters(72, TemperatureType.F);
        tuner.setParams(params);
        tuner.setCalculator(new NAFCalculator());

        Instrument inst = tuner.getInstrument();
        Tuning tuning = tuner.getTuning();

        System.out.println("=== Instrument Structure ===");
        Mouthpiece mp = inst.getMouthpiece();
        System.out.println("Mouthpiece position: " + String.format("%.8f", mp.getBorePosition()) + " m");
        System.out.println("Mouthpiece boreDiameter: " + String.format("%.8f", mp.getBoreDiameter()) + " m");

        System.out.println("\n=== Bore Points (original, sorted) ===");
        List<BorePoint> borePoints = inst.getBorePoint();
        // Sort bore points by position
        borePoints.sort((a, b) -> Double.compare(a.getBorePosition(), b.getBorePosition()));
        for (int i = 0; i < borePoints.size(); i++) {
            BorePoint bp = borePoints.get(i);
            System.out.println("BorePoint[" + i + "]: pos=" + String.format("%.8f", bp.getBorePosition()) +
                " m, dia=" + String.format("%.8f", bp.getBoreDiameter()) + " m");
        }

        System.out.println("\n=== Holes ===");
        List<Hole> holes = inst.getHole();
        for (int i = 0; i < holes.size(); i++) {
            Hole h = holes.get(i);
            System.out.println("Hole[" + i + "] (" + h.getName() + "): pos=" + String.format("%.8f", h.getBorePosition()) +
                " m, dia=" + String.format("%.8f", h.getDiameter()) + " m, height=" + String.format("%.8f", h.getHeight()) +
                " m, boreDia=" + String.format("%.8f", h.getBoreDiameter()) + " m");
        }

        System.out.println("\n=== Termination ===");
        Termination term = inst.getTermination();
        System.out.println("Position: " + String.format("%.8f", term.getBorePosition()) + " m");
        System.out.println("Bore diameter: " + String.format("%.8f", term.getBoreDiameter()) + " m");
        System.out.println("Flange diameter: " + String.format("%.8f", term.getFlangeDiameter()) + " m");

        System.out.println("\n=== Headspace Sections ===");
        List<BoreSection> headspace = mp.getHeadspace();
        if (headspace != null && !headspace.isEmpty()) {
            for (int i = 0; i < headspace.size(); i++) {
                BoreSection hs = headspace.get(i);
                System.out.println("Headspace[" + i + "]: length=" + String.format("%.8f", hs.getLength()) +
                    " m, leftR=" + String.format("%.8f", hs.getLeftRadius()) +
                    " m, rightR=" + String.format("%.8f", hs.getRightRadius()) + " m");
            }
        } else {
            System.out.println("No headspace sections");
        }

        System.out.println("\n=== Component List (bore sections and holes) ===");
        List<ComponentInterface> components = inst.getComponents();
        for (int i = 0; i < components.size(); i++) {
            ComponentInterface comp = components.get(i);
            if (comp instanceof BoreSection) {
                BoreSection bs = (BoreSection) comp;
                System.out.println("Component[" + i + "] BoreSection: length=" + String.format("%.8f", bs.getLength()) +
                    " m, leftR=" + String.format("%.8f", bs.getLeftRadius()) +
                    " m, rightR=" + String.format("%.8f", bs.getRightRadius()) +
                    " m, rightPos=" + String.format("%.8f", bs.getRightBorePosition()) + " m");
            } else if (comp instanceof Hole) {
                Hole h = (Hole) comp;
                System.out.println("Component[" + i + "] Hole (" + h.getName() + "): pos=" + String.format("%.8f", h.getBorePosition()) + " m");
            }
        }

        // Create NAF calculator
        InstrumentCalculator calc = new NAFCalculator(inst, params);

        // Test impedance at first note
        Fingering fingering = tuning.getFingering().get(0);
        double targetFreq = fingering.getNote().getFrequency();

        System.out.println("\n=== Test Impedance Calculation ===");
        System.out.println("Note: " + fingering.getNote().getName() + ", Target freq: " + targetFreq + " Hz");

        StringBuilder openHoles = new StringBuilder();
        List<Boolean> openHoleList = fingering.getOpenHole();
        for (int i = 0; i < openHoleList.size(); i++) {
            if (openHoleList.get(i)) {
                if (openHoles.length() > 0) openHoles.append(", ");
                openHoles.append(i);
            }
        }
        System.out.println("Open holes: " + (openHoles.length() > 0 ? openHoles.toString() : "none"));

        Complex Z = calc.calcZ(targetFreq, fingering);
        double boreRadius = mp.getBoreDiameter() / 2;
        double Z0 = params.calcZ0(boreRadius);

        System.out.println("\nZ = (" + Z.getReal() + ", " + Z.getImaginary() + ")");
        System.out.println("Z0 = " + Z0);
        System.out.println("Z/Z0 = (" + Z.getReal()/Z0 + ", " + Z.getImaginary()/Z0 + ")");
    }
}
