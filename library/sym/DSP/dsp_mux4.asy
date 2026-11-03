Version 4
SymbolType CELL
LINE Normal -32 -80 32 -64
LINE Normal 32 -64 32 64
LINE Normal 32 64 -32 80
LINE Normal -32 80 -32 -80
LINE Normal 0 72 0 104
TEXT 8 92 Left 1 sel
TEXT 0 0 Center 1 
LINE Normal -64 -48 -32 -48
TEXT -26 -48 Left 0 0
LINE Normal -64 -16 -32 -16
TEXT -26 -16 Left 0 1
LINE Normal -64 16 -32 16
TEXT -26 16 Left 0 2
LINE Normal -64 48 -32 48
TEXT -26 48 Left 0 3
LINE Normal 32 0 64 0
LINE Normal 4 98 0 92
LINE Normal 0 92 -4 98
LINE Normal -58 -52 -52 -48
LINE Normal -52 -48 -58 -44
LINE Normal -58 -20 -52 -16
LINE Normal -52 -16 -58 -12
LINE Normal -58 12 -52 16
LINE Normal -52 16 -58 20
LINE Normal -58 44 -52 48
LINE Normal -52 48 -58 52
LINE Normal 54 -4 60 0
LINE Normal 60 0 54 4
WINDOW 0 0 -88 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_mux4
SYMATTR ModelFile dsp_mux4.sub
SYMATTR Description Verilog module dsp_mux4
PIN -64 -48 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN -64 -16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN -64 16 NONE 0
PINATTR PinName c[15:0]
PINATTR SpiceOrder 3
PIN -64 48 NONE 0
PINATTR PinName d[15:0]
PINATTR SpiceOrder 4
PIN 0 104 NONE 0
PINATTR PinName sel[1:0]
PINATTR SpiceOrder 5
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 6
