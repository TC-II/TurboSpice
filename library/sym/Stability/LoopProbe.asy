Version 4
SymbolType CELL
RECTANGLE Normal -32 -12 32 12
LINE Normal -48 0 -32 0
LINE Normal 32 0 48 0
LINE Normal -20 0 18 0
LINE Normal 10 -5 18 0
LINE Normal 10 5 18 0
TEXT 0 -20 Center 0 T
WINDOW 0 0 -32 Center 2
SYMATTR Prefix X
SYMATTR InstName LP1
SYMATTR SpiceModel LoopProbe
SYMATTR ModelFile Stability/LoopProbe.lib
SYMATTR Description Loop gain probe for the stability analysis (.stb, Tian or GFT). In series in the loop: the signal goes in at the left pin (the arrow's direction). Transparent in any other analysis.
PIN -48 0 NONE 0
PINATTR PinName p1
PINATTR SpiceOrder 1
PIN 48 0 NONE 0
PINATTR PinName p2
PINATTR SpiceOrder 2
