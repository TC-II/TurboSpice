Version 4
SymbolType CELL
LINE Normal -32 -48 32 -32
LINE Normal 32 -32 32 32
LINE Normal 32 32 -32 48
LINE Normal -32 48 -32 -48
LINE Normal 0 40 0 72
TEXT 8 60 Left 1 sel
TEXT 0 0 Center 1 
LINE Normal -64 -16 -32 -16
TEXT -26 -16 Left 0 0
LINE Normal -64 16 -32 16
TEXT -26 16 Left 0 1
LINE Normal 32 0 64 0
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_mux2
SYMATTR ModelFile dsp_mux2.sub
SYMATTR Description Verilog module dsp_mux2
PIN -64 -16 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN -64 16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN 0 72 NONE 0
PINATTR PinName sel
PINATTR SpiceOrder 3
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 4
