Version 4
SymbolType CELL
LINE Normal 0 -48 0 -30
LINE Normal 0 30 0 48
CIRCLE Normal -30 -30 30 30
LINE Normal 0 -30 0 -8
LINE Normal -14 -8 14 -8
LINE Normal 0 30 0 8
LINE Normal -14 8 14 8
LINE Normal 16 0 12 -2
LINE Normal 12 -2 12 2
LINE Normal 12 2 16 0
WINDOW 0 16 -48 Left 2
SYMATTR Prefix X
SYMATTR Value2 Vstrike=100 Vhold=50
SYMATTR ModelFile neonbulb.sub
SYMATTR SpiceModel neonbulb
SYMATTR SpiceLine Zon=2K Ihold=200u
SYMATTR SpiceLine2 Tau=100u
SYMATTR Description Lámpara de neón
PIN 0 -48 NONE 0
PINATTR PinName V+
PINATTR SpiceOrder 1
PIN 0 48 NONE 0
PINATTR PinName V-
PINATTR SpiceOrder 2
