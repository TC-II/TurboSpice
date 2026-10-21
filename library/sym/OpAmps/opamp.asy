Version 4
SymbolType CELL
LINE Normal -32 32 32 64
LINE Normal 32 64 -32 96
LINE Normal -32 96 -32 32
LINE Normal -26 48 -18 48
LINE Normal -26 80 -18 80
LINE Normal -22 76 -22 84
WINDOW 0 0 32 Left 2
SYMATTR Value opamp
SYMATTR Prefix X
SYMATTR SpiceLine Aol=100K
SYMATTR SpiceLine2 GBW=10Meg
SYMATTR Description Amp. op. de un polo (Aol, GBW); requiere .lib opamp.sub
PIN -32 48 NONE 0
PINATTR PinName invin
PINATTR SpiceOrder 1
PIN -32 80 NONE 0
PINATTR PinName noninvin
PINATTR SpiceOrder 2
PIN 32 64 NONE 0
PINATTR PinName out
PINATTR SpiceOrder 3
