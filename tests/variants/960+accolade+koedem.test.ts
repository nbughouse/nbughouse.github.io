import { commonVariantTests } from "../suites/common";
import { chess960Tests } from "../suites/chess960";
import { accoladeTests } from "../suites/accolade";
import { koedemTests } from "../suites/koedem";

commonVariantTests("960+accolade+koedem");
chess960Tests("960+accolade+koedem");
accoladeTests("960+accolade+koedem");
koedemTests("960+accolade+koedem");
