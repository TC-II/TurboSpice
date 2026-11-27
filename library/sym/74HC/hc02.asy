Version 4
SymbolType CELL
ARC Normal -96 -32 32 96 -32 -32 23 0
ARC Normal -96 -96 32 32 23 0 -32 32
ARC Normal -152 -64 -23 65 -32 -32 -32 32
LINE Normal -32 -16 -25 -16
LINE Normal -32 16 -25 16
CIRCLE Normal 23 -4 31 4
LINE Normal 31 0 32 0
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto
SYMATTR Prefix X
SYMATTR Value hc02
SYMATTR ModelFile hc02.sub
SYMATTR Description 74HC02: 2-input NOR gate (one of four)
PIN -32 -16 NONE 0
PINATTR PinName a
PINATTR SpiceOrder 1
PIN -32 16 NONE 0
PINATTR PinName b
PINATTR SpiceOrder 2
PIN 32 0 NONE 0
PINATTR PinName y
PINATTR SpiceOrder 3
