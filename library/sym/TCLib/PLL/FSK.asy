Version 4
SymbolType CELL
LINE Normal 0 -48 0 -32
LINE Normal 0 32 0 48
LINE Normal 16 -37 16 -47
LINE Normal 11 -42 21 -42
LINE Normal -64 0 -32 0
LINE Normal -42 -4 -32 0
LINE Normal -42 4 -32 0
LINE Normal -24 10 -20 10
LINE Normal -20 10 -20 -10
LINE Normal -20 -10 -10 -10
LINE Normal -10 -10 -10 10
LINE Normal -10 10 0 10
LINE Normal 0 10 0 -10
LINE Normal 0 -10 5 -10
LINE Normal 5 -10 5 10
LINE Normal 5 10 10 10
LINE Normal 10 10 10 -10
LINE Normal 10 -10 15 -10
LINE Normal 15 -10 15 10
LINE Normal 15 10 24 10
CIRCLE Normal -32 -32 32 32
TEXT -11 18 Center 0 f1
TEXT 11 18 Center 0 f2
WINDOW 3 45 -22 Left 1
WINDOW 123 45 0 Left 1
WINDOW 39 45 21 Left 1
SYMATTR Value f1=1200
SYMATTR Value2 f2=2400
SYMATTR SpiceLine Vcc=5
SYMATTR SpiceModel FSK
SYMATTR Prefix X
SYMATTR Description FSK modulator: square wave 0 to Vcc, f1 with In=0 and f2 with In=Vcc (continuous phase), created by Javier Petrucci and Agustin Gullino (ITBA)
SYMATTR ModelFile TCLib/PLL/FSK.lib
PIN 0 -48 NONE 8
PINATTR PinName V+
PINATTR SpiceOrder 1
PIN 0 48 NONE 8
PINATTR PinName V-
PINATTR SpiceOrder 2
PIN -64 0 NONE 8
PINATTR PinName In
PINATTR SpiceOrder 3
