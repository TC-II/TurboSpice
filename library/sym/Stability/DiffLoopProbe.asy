Version 4
SymbolType CELL
RECTANGLE Normal -32 -40 32 40
LINE Normal -48 -32 -32 -32
LINE Normal -48 32 -32 32
LINE Normal 32 -32 48 -32
LINE Normal 32 32 48 32
LINE Normal -20 0 18 0
LINE Normal 10 -5 18 0
LINE Normal 10 5 18 0
TEXT -28 -32 Left 0 +
TEXT -28 32 Left 0 -
TEXT 28 -32 Right 0 +
TEXT 28 32 Right 0 -
TEXT 0 -14 Center 0 DM/CM
WINDOW 0 0 -52 Center 2
SYMATTR Prefix X
SYMATTR InstName LP1
SYMATTR SpiceModel DiffLoopProbe
SYMATTR ModelFile Stability/LoopProbe.lib
SYMATTR Description Differential loop gain probe (.stb): two ideal baluns back to back, with a probe in the differential mode and another in the common mode; the analysis chooses which one. In series in a differential pair, signal in at the left. Transparent in any other analysis.
PIN -48 -32 NONE 0
PINATTR PinName p1
PINATTR SpiceOrder 1
PIN -48 32 NONE 0
PINATTR PinName n1
PINATTR SpiceOrder 2
PIN 48 -32 NONE 0
PINATTR PinName p2
PINATTR SpiceOrder 3
PIN 48 32 NONE 0
PINATTR PinName n2
PINATTR SpiceOrder 4
