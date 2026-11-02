Version 4
SymbolType CELL
CIRCLE Normal -24 -24 24 24
LINE Normal -64 0 -24 0
LINE Normal 0 -64 0 -24
LINE Normal 24 0 64 0
TEXT 0 0 Center 3 Σ
TEXT -38 -12 Center 1 +
TEXT 14 -40 Center 1 −
WINDOW 0 -28 32 Right 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n SAT=1 W=16
SYMATTR Prefix X
SYMATTR Value dsp_sub
SYMATTR ModelFile dsp_sub.sub
SYMATTR Description Verilog module dsp_sub
PIN -64 0 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN 0 -64 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
