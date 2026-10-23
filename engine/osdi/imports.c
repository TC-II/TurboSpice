// Funciones de libc/libm que pueden importar los modelos Verilog-A compilados por OpenVAF a wasm32
// (#209). build.sh pasa este side module al link (como los .cm) para que el módulo principal,
// con MAIN_MODULE=2, las exporte: un .osdi las resuelve al cargarse con pre_osdi.
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef void (*fn)(void);
fn osdi_imports[] = {
    (fn)exp, (fn)log, (fn)log10, (fn)pow, (fn)sqrt, (fn)cbrt, (fn)hypot,
    (fn)sin, (fn)cos, (fn)tan, (fn)asin, (fn)acos, (fn)atan, (fn)atan2,
    (fn)sinh, (fn)cosh, (fn)tanh, (fn)asinh, (fn)acosh, (fn)atanh,
    (fn)floor, (fn)ceil, (fn)trunc, (fn)round, (fn)lround, (fn)llround, (fn)fmod, (fn)fabs,
    (fn)fmin, (fn)fmax, (fn)erf, (fn)erfc, (fn)expm1, (fn)log1p,
    (fn)malloc, (fn)calloc, (fn)realloc, (fn)free,
    (fn)snprintf, (fn)sprintf, (fn)strlen, (fn)strcmp, (fn)strcpy, (fn)strcat, (fn)memcpy, (fn)memset,
};
