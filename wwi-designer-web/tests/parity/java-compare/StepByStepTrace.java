/**
 * Step-by-step trace of impedance calculation, showing state vector after each component.
 *
 * Compile and run in wwi-designer-web/tests/parity/java-compare:
 * WIJAR="/home/user/WWIDesigner/WWIDesigner/releases/2/WIDesigner-2.6/WIDesigner-2.6.0.jar"
 * LIBDIR="/home/user/WWIDesigner/WWIDesigner/releases/2/WIDesigner-2.6/lib-2.6"
 * javac -cp ".:${WIJAR}:${LIBDIR}/*" StepByStepTrace.java
 * java -cp ".:${WIJAR}:${LIBDIR}/*" StepByStepTrace
 */

import com.wwidesigner.geometry.Instrument;
import com.wwidesigner.geometry.Mouthpiece;
import com.wwidesigner.geometry.Hole;
import com.wwidesigner.geometry.BorePoint;
import com.wwidesigner.geometry.BoreSection;
import com.wwidesigner.geometry.Termination;
import com.wwidesigner.geometry.ComponentInterface;
import com.wwidesigner.geometry.calculation.DefaultHoleCalculator;
import com.wwidesigner.geometry.calculation.SimpleBoreSectionCalculator;
import com.wwidesigner.geometry.calculation.ThickFlangedOpenEndCalculator;
import com.wwidesigner.geometry.calculation.DefaultFippleMouthpieceCalculator;
import com.wwidesigner.math.TransferMatrix;
import com.wwidesigner.math.StateVector;
import com.wwidesigner.note.Fingering;
import com.wwidesigner.note.Tuning;
import com.wwidesigner.modelling.NAFCalculator;
import com.wwidesigner.modelling.SimpleInstrumentTuner;
import com.wwidesigner.util.Constants.TemperatureType;
import com.wwidesigner.util.PhysicalParameters;
import org.apache.commons.math3.complex.Complex;

import java.util.List;

public class StepByStepTrace {

    private static String instrumentFile = "/home/user/WWIDesigner/wwi-designer-web/tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_geometry.xml";
    private static String tuningFile = "/home/user/WWIDesigner/wwi-designer-web/tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_tuning.xml";

    static final double NAF_HOLE_SIZE_MULT = 0.9605;

    public static void main(String[] args) throws Exception {
        System.out.println("=== Step-by-Step Impedance Trace (Java) ===\n");

        // Load instrument and tuning
        SimpleInstrumentTuner tuner = new SimpleInstrumentTuner();
        tuner.setInstrument(instrumentFile, false);
        tuner.setTuning(tuningFile, false);

        PhysicalParameters params = new PhysicalParameters(72, TemperatureType.F);
        tuner.setParams(params);
        tuner.setCalculator(new NAFCalculator());

        Instrument inst = tuner.getInstrument();
        Tuning tuning = tuner.getTuning();

        // Get first fingering and frequency
        Fingering fingering = tuning.getFingering().get(0);
        double targetFreq = fingering.getNote().getFrequency();
        double waveNumber = params.calcWaveNumber(targetFreq);

        System.out.println("Frequency: " + targetFreq + " Hz");
        System.out.println("Wave number: " + waveNumber);
        System.out.println("All holes closed: " + !fingering.getOpenHole().stream().anyMatch(b -> b));

        // Create calculators (matching NAFCalculator settings)
        ThickFlangedOpenEndCalculator termCalc = new ThickFlangedOpenEndCalculator();
        DefaultHoleCalculator holeCalc = new DefaultHoleCalculator(NAF_HOLE_SIZE_MULT);
        SimpleBoreSectionCalculator boreCalc = new SimpleBoreSectionCalculator();
        DefaultFippleMouthpieceCalculator mpCalc = new DefaultFippleMouthpieceCalculator();

        // Get components
        List<ComponentInterface> components = inst.getComponents();
        List<Boolean> openHoles = fingering.getOpenHole();

        // Start at termination
        Termination term = inst.getTermination();
        boolean isOpenEnd = true;
        StateVector sv = termCalc.calcStateVector(term, isOpenEnd, waveNumber, params);

        System.out.println("\n=== Starting at Termination ===");
        System.out.println("Termination bore radius: " + (term.getBoreDiameter()/2));
        printStateVector(sv, "After termination", params, term.getBoreDiameter()/2);

        // Walk through components from termination to mouthpiece
        int holeIndex = openHoles.size() - 1;

        for (int i = components.size() - 1; i >= 0; i--) {
            ComponentInterface comp = components.get(i);
            TransferMatrix tm;
            String compName;

            if (comp instanceof BoreSection) {
                BoreSection section = (BoreSection) comp;
                tm = boreCalc.calcTransferMatrix(section, waveNumber, params);
                compName = "BoreSection[" + i + "] (len=" + String.format("%.6f", section.getLength()) +
                    ", leftR=" + String.format("%.6f", section.getLeftRadius()) +
                    ", rightR=" + String.format("%.6f", section.getRightRadius()) + ")";
            } else {
                Hole hole = (Hole) comp;
                boolean isOpen = openHoles.get(holeIndex--);
                tm = holeCalc.calcTransferMatrix(hole, isOpen, waveNumber, params);
                compName = "Hole[" + i + "] " + hole.getName() + " (isOpen=" + isOpen + ")";
            }

            sv = tm.multiply(sv);

            System.out.println("\n--- " + compName + " ---");
            printTransferMatrix(tm);
            double boreRadius = inst.getMouthpiece().getBoreDiameter() / 2;
            printStateVector(sv, "After component", params, boreRadius);
        }

        // Apply mouthpiece
        Mouthpiece mp = inst.getMouthpiece();
        sv = mpCalc.calcStateVector(sv, mp, waveNumber, params);

        System.out.println("\n=== After Mouthpiece ===");
        double boreRadius = mp.getBoreDiameter() / 2;
        printStateVector(sv, "Final", params, boreRadius);

        // Final impedance
        Complex Z = sv.getImpedance();
        double Z0 = params.calcZ0(boreRadius);
        System.out.println("\n=== Final Result ===");
        System.out.println("Z = (" + Z.getReal() + ", " + Z.getImaginary() + ")");
        System.out.println("Z0 = " + Z0);
        System.out.println("Z/Z0 = (" + Z.getReal()/Z0 + ", " + Z.getImaginary()/Z0 + ")");
    }

    static void printStateVector(StateVector sv, String label, PhysicalParameters params, double boreRadius) {
        Complex Z = sv.getImpedance();
        double Z0 = params.calcZ0(boreRadius);

        System.out.println(label + ":");
        System.out.println("  Z = (" + Z.getReal() + ", " + Z.getImaginary() + ")");
        System.out.println("  Z/Z0 = (" + Z.getReal()/Z0 + ", " + Z.getImaginary()/Z0 + ")");
    }

    static void printTransferMatrix(TransferMatrix tm) {
        System.out.println("  TM: PP=(" + tm.getPP().getReal() + ", " + tm.getPP().getImaginary() + ")");
        System.out.println("      PU=(" + tm.getPU().getReal() + ", " + tm.getPU().getImaginary() + ")");
        System.out.println("      UP=(" + tm.getUP().getReal() + ", " + tm.getUP().getImaginary() + ")");
        System.out.println("      UU=(" + tm.getUU().getReal() + ", " + tm.getUU().getImaginary() + ")");
    }
}
