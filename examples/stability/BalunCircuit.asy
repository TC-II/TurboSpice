Version 4
SymbolType BLOCK
RECTANGLE Normal -32 -48 32 48
LINE Normal -48 -32 -32 -32
LINE Normal -48 32 -32 32
LINE Normal 32 -32 48 -32
LINE Normal 32 32 48 32
ARC Normal -14 -24 -2 -12 -8 -12 -8 -24
ARC Normal -14 -12 -2 0 -8 0 -8 -12
ARC Normal -14 0 -2 12 -8 12 -8 0
ARC Normal -14 12 -2 24 -8 24 -8 12
ARC Normal 2 -24 14 -12 8 -24 8 -12
ARC Normal 2 -12 14 0 8 -12 8 0
ARC Normal 2 0 14 12 8 0 8 12
ARC Normal 2 12 14 24 8 12 8 24
TEXT -28 -36 Left 0 p
TEXT -28 36 Left 0 n
TEXT 28 -36 Right 0 d
TEXT 28 36 Right 0 c
WINDOW 0 0 -60 Center 2
SYMATTR Prefix X
SYMATTR InstName B1
SYMATTR Description The Balun drawn as a subcircuit of the project: double-click it to see its E and F sources.
PIN -48 -32 NONE 0
PINATTR PinName p
PINATTR SpiceOrder 1
PIN -48 32 NONE 0
PINATTR PinName n
PINATTR SpiceOrder 2
PIN 48 -32 NONE 0
PINATTR PinName d
PINATTR SpiceOrder 3
PIN 48 32 NONE 0
PINATTR PinName c
PINATTR SpiceOrder 4
