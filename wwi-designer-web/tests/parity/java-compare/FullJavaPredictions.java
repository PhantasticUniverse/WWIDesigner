/**
 * Full Java predictions using actual WWIDesigner classes.
 * Compile with: javac -cp ".:wwidesigner.jar:commons-math3-3.5.jar" FullJavaPredictions.java
 * Run with: java -cp ".:wwidesigner.jar:commons-math3-3.5.jar" FullJavaPredictions
 */
import com.wwidesigner.geometry.Instrument;
import com.wwidesigner.geometry.Mouthpiece;
import com.wwidesigner.geometry.BoreSection;
import com.wwidesigner.geometry.calculation.DefaultFippleMouthpieceCalculator;
import com.wwidesigner.modelling.NAFCalculator;
import com.wwidesigner.modelling.SimpleInstrumentTuner;
import com.wwidesigner.note.Fingering;
import com.wwidesigner.note.Note;
import com.wwidesigner.note.Tuning;
import com.wwidesigner.util.Constants.TemperatureType;
import com.wwidesigner.util.PhysicalParameters;

import java.util.List;

public class FullJavaPredictions {

    // Files are in tests/parity/fixtures/java-examples/modelling
    private static String instrumentFile = "/home/user/WWIDesigner/wwi-designer-web/tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_geometry.xml";
    private static String tuningFile = "/home/user/WWIDesigner/wwi-designer-web/tests/parity/fixtures/java-examples/modelling/NAF_D_minor_cherry_actual_tuning.xml";

    public static void main(String[] args) {
        try {
            SimpleInstrumentTuner tuner = new SimpleInstrumentTuner();
            // Use false for file path (not classpath resource)
            tuner.setInstrument(instrumentFile, false);
            tuner.setTuning(tuningFile, false);
            tuner.setParams(new PhysicalParameters(72.0, TemperatureType.F));
            tuner.setCalculator(new NAFCalculator());

            // Get instrument and print headspace info
            Instrument instrument = tuner.getInstrument();
            Mouthpiece mp = instrument.getMouthpiece();

            System.out.println("=== Java Full Predictions ===\n");
            System.out.println("Mouthpiece position: " + mp.getPosition() + " m");
            System.out.println("Mouthpiece boreDiameter: " + mp.getBoreDiameter() + " m");

            List<BoreSection> headspace = mp.getHeadspace();
            System.out.println("\n=== Headspace Sections ===");
            System.out.println("Number of sections: " + headspace.size());

            double totalVolume = 0;
            for (int i = 0; i < headspace.size(); i++) {
                BoreSection section = headspace.get(i);
                double leftR = section.getLeftRadius();
                double rightR = section.getRightRadius();
                double length = section.getLength();
                double volume = Math.PI * length * (leftR*leftR + leftR*rightR + rightR*rightR) / 3.0;
                totalVolume += volume;
                System.out.println("Section " + i + ": length=" + String.format("%.10f", length) +
                    " m, leftR=" + String.format("%.10f", leftR) +
                    " m, rightR=" + String.format("%.10f", rightR) +
                    " m, volume=" + String.format("%.15e", volume) + " m³");
            }
            System.out.println("Total headspace volume: " + String.format("%.15e", totalVolume) + " m³");
            System.out.println("Total * 2 (calcHeadspaceVolume return): " + String.format("%.15e", totalVolume * 2) + " m³");

            // Position-based comparison
            double posLength = mp.getPosition();
            double radius = mp.getBoreDiameter() / 2;
            double posVolume = Math.PI * radius * radius * posLength;
            System.out.println("\nPosition-based comparison:");
            System.out.println("Position length: " + String.format("%.10f", posLength) + " m");
            System.out.println("Position volume: " + String.format("%.15e", posVolume) + " m³");
            System.out.println("Position * 2: " + String.format("%.15e", posVolume * 2) + " m³");
            System.out.println("Bore-section / Position ratio: " + String.format("%.6f", (totalVolume * 2) / (posVolume * 2)));

            // Get predicted tuning
            System.out.println("\n=== Predictions ===");
            System.out.println("Note\t\tTarget (Hz)\tPredicted (Hz)\tDeviation (cents)");
            System.out.println("----\t\t----------\t--------------\t-----------------");

            Tuning predicted = tuner.getPredictedTuning();
            List<Fingering> tgtFingering = tuner.getTuning().getFingering();
            List<Fingering> predFingering = predicted.getFingering();

            double totalCents = 0;
            int count = 0;

            for (int i = 0; i < tgtFingering.size(); i++) {
                Note tgtNote = tgtFingering.get(i).getNote();
                Note predNote = predFingering.get(i).getNote();

                if (tgtNote != null && predNote != null &&
                    tgtNote.getFrequency() != null && predNote.getFrequency() != null) {

                    double tgtFreq = tgtNote.getFrequency();
                    double predFreq = predNote.getFrequency();
                    double cents = Note.cents(tgtFreq, predFreq);

                    String name = tgtNote.getName() != null ? tgtNote.getName() : "Note " + i;
                    System.out.println(String.format("%-12s\t%.2f\t\t%.2f\t\t%.2f",
                        name, tgtFreq, predFreq, cents));

                    totalCents += Math.abs(cents);
                    count++;
                }
            }

            System.out.println("\nTotal notes: " + count);
            System.out.println("Average |deviation|: " + String.format("%.2f", totalCents / count) + " cents");

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
