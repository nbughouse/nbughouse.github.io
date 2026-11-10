import { commonVariantTests } from "../suites/common";
import { chess960Tests } from "../suites/chess960";
import { accoladeTests } from "../suites/accolade";
import { taijituTests } from "../suites/taijitu";

commonVariantTests("960+accolade+taijitu");
chess960Tests("960+accolade+taijitu");
accoladeTests("960+accolade+taijitu");
taijituTests("960+accolade+taijitu");
