Version 4
SymbolType CELL
LINE Normal -64 0 -48 0
LINE Normal -48 0 -48 -12
LINE Normal -48 -12 12 -12
LINE Normal 0 64 0 12
LINE Normal 0 12 12 12
LINE Normal 54 0 64 0
RECTANGLE Normal 64 -64 -64 64
ARC Normal -35 -24 61 72 54 0 13 -24
ARC Normal -35 -72 61 24 13 24 54 0
ARC Normal -77 -48 20 49 13 24 13 -24
ARC Normal -83 -48 14 49 7 24 7 -24
TEXT -61 16 Left 1 Vi
TEXT -16 64 Bottom 1 Vf
TEXT 98 20 Right 2 Vo
TEXT 0 -76 Center 1 Phase Comparator
WINDOW 3 21 76 Left 0
SYMATTR Value Vcc=5
SYMATTR Prefix X
SYMATTR SpiceModel Phase_Comp_XOR
SYMATTR Description XOR phase comparator: Vo = Vcc when exactly one input is high (threshold Vcc/2), created by Javier Petrucci and Agustin Gullino (ITBA)
SYMATTR ModelFile TCLib/PLL/Phase_Comp_XOR.lib
PIN -64 0 NONE 8
PINATTR PinName Vi
PINATTR SpiceOrder 1
PIN 0 64 NONE 8
PINATTR PinName Vf
PINATTR SpiceOrder 2
PIN 64 0 NONE 8
PINATTR PinName Vo
PINATTR SpiceOrder 3
