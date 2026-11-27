Version 4
SymbolType CELL
ARC Normal -96 -32 32 96 -32 -32 23 0
ARC Normal -96 -96 32 32 23 0 -32 32
ARC Normal -152 -64 -23 65 -32 -32 -32 32
ARC Normal -160 -64 -31 65 -40 -32 -40 32
LINE Normal -48 -16 -33 -16
LINE Normal -48 16 -33 16
LINE Normal 23 0 32 0
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto
SYMATTR Prefix X
SYMATTR Value hc86
SYMATTR ModelFile hc86.sub
SYMATTR Description 74HC86: 2-input XOR gate (one of four)
PIN -48 -16 NONE 0
PINATTR PinName a
PINATTR SpiceOrder 1
PIN -48 16 NONE 0
PINATTR PinName b
PINATTR SpiceOrder 2
PIN 32 0 NONE 0
PINATTR PinName y
PINATTR SpiceOrder 3
