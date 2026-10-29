Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 80 112
LINE Normal -80 -32 -64 -32
LINE Normal -80 0 -64 0
LINE Normal -80 32 -64 32
LINE Normal -80 64 -64 64
LINE Normal -80 96 -64 96
LINE Normal 80 16 96 16
LINE Normal -64 24 -54 32
LINE Normal -54 32 -64 40
LINE Normal -32 16 -8 16
LINE Normal -8 16 14 4
LINE Normal 16 16 40 16
LINE Normal 40 16 40 40
LINE Normal 30 40 50 40
LINE Normal 30 46 50 46
LINE Normal 40 46 40 56
WINDOW 0 -64 -80 Left 2
WINDOW 3 -64 120 Left 2
SYMATTR Prefix A
SYMATTR SpiceModel SAMPLEHOLD
SYMATTR Description Sample and hold: samples on the rising edge of CLK, or tracks while S/H is high (use one of them)
PIN -80 -32 NONE 0
PINATTR PinName in+
PINATTR SpiceOrder 1
PIN -80 0 NONE 0
PINATTR PinName in-
PINATTR SpiceOrder 2
PIN -80 32 NONE 0
PINATTR PinName CLK
PINATTR SpiceOrder 3
PIN -80 64 NONE 0
PINATTR PinName S/H
PINATTR SpiceOrder 4
PIN 96 16 NONE 0
PINATTR PinName out
PINATTR SpiceOrder 7
PIN -80 96 NONE 0
PINATTR PinName com
PINATTR SpiceOrder 8
