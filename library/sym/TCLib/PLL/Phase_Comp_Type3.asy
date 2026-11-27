Version 4
SymbolType CELL
LINE Normal -64 0 -24 0
LINE Normal 0 64 0 32
LINE Normal 32 0 64 0
LINE Normal -24 -8 -14 0
LINE Normal -14 0 -24 8
LINE Normal -8 32 0 22
LINE Normal 0 22 8 32
RECTANGLE Normal 64 -64 -64 64
RECTANGLE Normal 32 -32 -24 32
TEXT -61 16 Left 1 Vi
TEXT -16 64 Bottom 1 Vf
TEXT 98 20 Right 2 Vo
TEXT -10 0 Left 1 S
TEXT 0 12 Center 1 R
TEXT 28 0 Right 1 Q
TEXT 0 -76 Center 1 Phase Comparator 3
WINDOW 3 21 76 Left 0
SYMATTR Value Vcc=5
SYMATTR Prefix X
SYMATTR SpiceModel Phase_Comp_Type3
SYMATTR Description Phase comparator type 3 (74HCT4046A PC3): Vo = Vcc from the rising edge of Vi to the rising edge of Vf (threshold Vcc/2), created by Javier Petrucci and Agustin Gullino (ITBA)
SYMATTR ModelFile TCLib/PLL/Phase_Comp_Type3.lib
PIN -64 0 NONE 8
PINATTR PinName Vi
PINATTR SpiceOrder 1
PIN 0 64 NONE 8
PINATTR PinName Vf
PINATTR SpiceOrder 2
PIN 64 0 NONE 8
PINATTR PinName Vo
PINATTR SpiceOrder 3
