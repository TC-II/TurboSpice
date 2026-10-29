Version 4
SymbolType CELL
RECTANGLE Normal 16 -32 128 112
LINE Normal 0 0 16 0
LINE Normal 0 64 16 64
LINE Normal 0 96 16 96
LINE Normal 128 32 144 32
LINE Normal 40 32 44 24
LINE Normal 44 24 48 18
LINE Normal 48 18 52 14
LINE Normal 52 14 56 12
LINE Normal 56 12 60 14
LINE Normal 60 14 64 18
LINE Normal 64 18 68 24
LINE Normal 68 24 72 32
LINE Normal 72 32 76 40
LINE Normal 76 40 80 46
LINE Normal 80 46 84 51
LINE Normal 84 51 88 52
LINE Normal 88 52 92 51
LINE Normal 92 51 96 46
LINE Normal 96 46 100 40
LINE Normal 100 40 104 32
WINDOW 0 16 -48 Left 2
WINDOW 3 16 120 Left 2
SYMATTR Prefix A
SYMATTR SpiceModel MODULATOR
SYMATTR Description VCO/modulator: V(AM)*sin, frequency space+V(FM)*(mark-space)
PIN 0 0 NONE 0
PINATTR PinName FM
PINATTR SpiceOrder 1
PIN 0 64 NONE 0
PINATTR PinName AM
PINATTR SpiceOrder 2
PIN 144 32 NONE 0
PINATTR PinName Q
PINATTR SpiceOrder 7
PIN 0 96 NONE 0
PINATTR PinName com
PINATTR SpiceOrder 8
