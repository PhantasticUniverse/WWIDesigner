/**
 * Java parity test harness.
 * Outputs key intermediate calculation values for comparison with TypeScript.
 */
package parity;

import java.io.*;
import java.util.List;
import com.wwidesigner.geometry.*;
import com.wwidesigner.geometry.bind.GeometryBindFactory;
import com.wwidesigner.geometry.calculation.*;
import com.wwidesigner.math.StateVector;
import com.wwidesigner.math.TransferMatrix;
import com.wwidesigner.modelling.*;
import com.wwidesigner.note.*;
import com.wwidesigner.note.bind.NoteBindFactory;
import com.wwidesigner.util.*;
import com.wwidesigner.util.Constants.TemperatureType;
import org.apache.commons.math3.complex.Complex;

public class ParityTest {
    private static final String INSTRUMENT_FILE = "tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_geometry.xml";
    private static final String TUNING_FILE = "tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_tuning.xml";

    public static void main(String[] args) throws Exception {
        // Load instrument
        GeometryBindFactory geometryFactory = GeometryBindFactory.getInstance();
        File instFile = new File(INSTRUMENT_FILE);
        Instrument instrument = (Instrument) geometryFactory.unmarshalXml(instFile, true);
        instrument.updateComponents();

        // Load tuning
        NoteBindFactory noteFactory = NoteBindFactory.getInstance();
        File tuningFile = new File(TUNING_FILE);
        Tuning tuning = (Tuning) noteFactory.unmarshalXml(tuningFile, true);

        // Create physical parameters at 72°F (same as NAFTuningTest)
        PhysicalParameters params = new PhysicalParameters(72.0, TemperatureType.F);

        System.out.println("=== Physical Parameters ===");
        System.out.printf("Temperature (C): %.6f%n", params.getTemperature());
        System.out.printf("Speed of sound: %.6f m/s%n", params.getSpeedOfSound());
        System.out.printf("Rho: %.6f kg/m³%n", params.getRho());

        // SimplePhysicalParameters
        SimplePhysicalParameters simpleParams = new SimplePhysicalParameters(params);
        System.out.println("\n=== Simple Physical Parameters ===");
        System.out.printf("Speed of sound: %.6f m/s%n", simpleParams.getSpeedOfSound());
        System.out.printf("Rho: %.6f kg/m³%n", simpleParams.getRho());
        System.out.printf("Gamma: %.6f%n", simpleParams.getGamma());

        // Create NAF calculator
        NAFCalculator calculator = new NAFCalculator(instrument, params);

        System.out.println("\n=== Instrument Details ===");
        System.out.printf("Mouthpiece position: %.6f m%n", instrument.getMouthpiece().getBorePosition());
        System.out.printf("Mouthpiece bore diameter: %.6f m%n", instrument.getMouthpiece().getBoreDiameter());

        Mouthpiece mp = instrument.getMouthpiece();
        System.out.println("\n=== Headspace sections ===");
        List<BoreSection> headspace = mp.getHeadspace();
        double totalVolume = 0;
        for (int i = 0; i < headspace.size(); i++) {
            BoreSection section = headspace.get(i);
            double vol = getSectionVolume(section);
            totalVolume += vol;
            System.out.printf("Section %d: length=%.6f m, leftR=%.6f m, rightR=%.6f m, vol=%.9f m³%n",
                i, section.getLength(), section.getLeftRadius(), section.getRightRadius(), vol);
        }
        System.out.printf("Total headspace volume: %.9f m³%n", totalVolume);
        System.out.printf("Headspace volume * 2: %.9f m³%n", totalVolume * 2);

        // Fipple parameters
        Mouthpiece.Fipple fipple = mp.getFipple();
        System.out.println("\n=== Fipple Parameters ===");
        System.out.printf("Window length: %.6f m%n", fipple.getWindowLength());
        System.out.printf("Window width: %.6f m%n", fipple.getWindowWidth());
        System.out.printf("Fipple factor: %.6f%n", fipple.getFippleFactor());
        System.out.printf("Windway height: %.6f m%n", fipple.getWindwayHeight());

        // Create tuner and get predictions
        SimpleInstrumentTuner tuner = new SimpleInstrumentTuner();
        tuner.setInstrument(instrument);
        tuner.setTuning(tuning);
        tuner.setParams(params);
        tuner.setCalculator(calculator);

        System.out.println("\n=== Tuning Predictions ===");
        System.out.println("Note\t\tTarget\t\tPredicted\tDeviation");
        System.out.println("----\t\t------\t\t---------\t---------");

        Tuning predicted = tuner.getPredictedTuning();
        List<Fingering> tgtFingering = tuning.getFingering();
        List<Fingering> predFingering = predicted.getFingering();

        double totalDeviation = 0;
        int count = 0;

        for (int i = 0; i < tgtFingering.size(); i++) {
            Note tgtNote = tgtFingering.get(i).getNote();
            Note predNote = predFingering.get(i).getNote();

            double tgtFreq = tgtNote.getFrequency();
            double predFreq = predNote.getFrequency();
            double deviation = Note.cents(tgtFreq, predFreq);

            System.out.printf("%s\t%.2f Hz\t%.2f Hz\t%.2f cents%n",
                tgtNote.getName(), tgtFreq, predFreq, deviation);

            totalDeviation += Math.abs(deviation);
            count++;
        }

        System.out.printf("%nAverage |deviation|: %.2f cents%n", totalDeviation / count);

        // Detailed calculation for first note
        System.out.println("\n=== Detailed Calculation (First Note) ===");
        double targetFreq = tgtFingering.get(0).getNote().getFrequency();
        Fingering firstFingering = tgtFingering.get(0);

        double waveNumber = params.calcWaveNumber(targetFreq);
        double omega = waveNumber * params.getSpeedOfSound();
        System.out.printf("Target frequency: %.2f Hz%n", targetFreq);
        System.out.printf("Wave number: %.6f rad/m%n", waveNumber);
        System.out.printf("Omega: %.4f rad/s%n", omega);

        // Calculate Z at target frequency
        StateVector sv = calculator.calcStateVector(targetFreq, firstFingering);
        Complex Z = sv.getImpedance();
        System.out.printf("Z real: %.4f%n", Z.getReal());
        System.out.printf("Z imag: %.4f%n", Z.getImaginary());
        System.out.printf("Z phase: %.4f degrees%n", Math.toDegrees(Z.getArgument()));
    }

    private static double getSectionVolume(BoreSection section) {
        double leftRadius = section.getLeftRadius();
        double rightRadius = section.getRightRadius();
        double length = section.getLength();
        return Math.PI * length * (leftRadius * leftRadius + leftRadius * rightRadius + rightRadius * rightRadius) / 3.0;
    }
}
