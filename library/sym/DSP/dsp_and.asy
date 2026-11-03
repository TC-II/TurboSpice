Version 4
SymbolType CELL
LINE Normal 0 -32 -32 -32
LINE Normal -32 -32 -32 32
LINE Normal -32 32 0 32
ARC Normal -32 -32 32 32 0 -32 0 32
LINE Normal -80 -16 -32 -16
LINE Normal -80 16 -32 16
LINE Normal 32 0 80 0
LINE Normal -74 -20 -68 -16
LINE Normal -68 -16 -74 -12
LINE Normal -74 12 -68 16
LINE Normal -68 16 -74 20
LINE Normal 70 -4 76 0
LINE Normal 76 0 70 4
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_and
SYMATTR ModelFile dsp_and.sub
SYMATTR Description Verilog module dsp_and
PIN -80 -16 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN -80 16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN 80 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
