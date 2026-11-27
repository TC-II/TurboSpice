Version 4
SymbolType CELL
LINE Normal -24 -32 -24 32
LINE Normal -24 -32 -12 -32
LINE Normal -24 32 -12 32
ARC Normal -44 -32 20 32 -12 -32 -12 32
LINE Normal -32 -16 -24 -16
LINE Normal -32 16 -24 16
CIRCLE Normal 20 -4 28 4
LINE Normal 28 0 32 0
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil=1.5 vih=3.5 vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto
SYMATTR Prefix X
SYMATTR Value hc00
SYMATTR ModelFile hc00.sub
SYMATTR Description 74HC00: 2-input NAND gate (one of four)
PIN -32 -16 NONE 0
PINATTR PinName a
PINATTR SpiceOrder 1
PIN -32 16 NONE 0
PINATTR PinName b
PINATTR SpiceOrder 2
PIN 32 0 NONE 0
PINATTR PinName y
PINATTR SpiceOrder 3
