import { commonVariantTests } from "../suites/common";
import { chess960Tests } from "../suites/chess960";
import { accoladeTests } from "../suites/accolade";

commonVariantTests("960+accolade");
chess960Tests("960+accolade");
accoladeTests("960+accolade");
