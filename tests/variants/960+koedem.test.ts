import { commonVariantTests } from "../suites/common";
import { chess960Tests } from "../suites/chess960";
import { koedemTests } from "../suites/koedem";

commonVariantTests("960+koedem");
chess960Tests("960+koedem");
koedemTests("960+koedem");
