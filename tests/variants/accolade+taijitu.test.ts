import { commonVariantTests } from "../suites/common";
import { accoladeTests } from "../suites/accolade";
import { taijituTests } from "../suites/taijitu";

commonVariantTests("accolade+taijitu");
accoladeTests("accolade+taijitu");
taijituTests("accolade+taijitu");
