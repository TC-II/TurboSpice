Version 4
SymbolType CELL
CIRCLE Normal -24 -24 24 24
LINE Normal -64 0 -24 0
LINE Normal 0 -64 0 -24
LINE Normal 24 0 64 0
TEXT 0 0 Center 3 ÷
LINE Normal -58 -4 -52 0
LINE Normal -52 0 -58 4
LINE Normal -4 -58 0 -52
LINE Normal 0 -52 4 -58
LINE Normal 54 -4 60 0
LINE Normal 60 0 54 4
WINDOW 0 -28 32 Right 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n F=15 SAT=1 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_div
SYMATTR ModelFile dsp_div.sub
SYMATTR Description Verilog module dsp_div
PIN -64 0 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN 0 -64 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
