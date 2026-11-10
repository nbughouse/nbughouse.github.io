import { commonVariantTests } from "../suites/common";
import { chess960Tests } from "../suites/chess960";
import { taijituTests } from "../suites/taijitu";

commonVariantTests("960+taijitu");
chess960Tests("960+taijitu");
taijituTests("960+taijitu");
