import { commonVariantTests } from "../suites/common";
import { accoladeTests } from "../suites/accolade";
import { koedemTests } from "../suites/koedem";

commonVariantTests("accolade+koedem");
accoladeTests("accolade+koedem");
koedemTests("accolade+koedem");
