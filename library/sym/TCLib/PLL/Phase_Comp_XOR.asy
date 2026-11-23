Version 4
SymbolType CELL
RECTANGLE Normal 64 -64 -64 65
ARC Normal -66 -24 30 72 -18 -24 23 0
ARC Normal -66 -72 30 24 23 0 -18 24
ARC Normal -108 -48 -11 49 -18 -24 -18 24
ARC Normal -114 -48 -17 49 -24 -24 -24 24
LINE Normal -64 0 -48 0
LINE Normal -48 0 -48 -12
LINE Normal -48 -12 -19 -12
LINE Normal 0 64 0 40
LINE Normal 0 40 -36 40
LINE Normal -36 40 -36 12
LINE Normal -36 12 -19 12
LINE Normal 23 0 64 0
TEXT -92 21 Left 2 Vi
TEXT -23 94 Bottom 2 Vf
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
