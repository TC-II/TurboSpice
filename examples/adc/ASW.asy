Version 4
SymbolType CELL
LINE Normal 0 40 0 24
LINE Normal 0 88 0 73
LINE Normal 17 67 0 40
LINE Normal -48 32 -32 32
LINE Normal -32 32 -23 37
LINE Normal -48 80 -32 80
LINE Normal -32 80 -23 75
LINE Normal 0 16 0 24
LINE Normal 0 96 0 88
LINE Normal -44 45 -44 39
LINE Normal -47 42 -41 42
LINE Normal 8 56 -21 56 2
CIRCLE Normal -32 24 32 88
WINDOW 0 40 40 Left 2
WINDOW 39 40 72 Left 0
SYMATTR Prefix X
SYMATTR SpiceModel ASW
SYMATTR ModelFile ASW.lib
SYMATTR SpiceLine ron=100 roff=1g
SYMATTR Description Analog switch (XSPICE aswitch) of the project: closed when V(Vc+, Vc-) > 4 V, open below 1 V
PIN 0 16 NONE 0
PINATTR PinName Sw1
PINATTR SpiceOrder 1
PIN 0 96 NONE 0
PINATTR PinName Sw2
PINATTR SpiceOrder 2
PIN -48 32 NONE 0
PINATTR PinName Vc+
PINATTR SpiceOrder 3
PIN -48 80 NONE 0
PINATTR PinName Vc-
PINATTR SpiceOrder 4

