Version 4
SymbolType CELL
RECTANGLE Normal -64 -32 64 32
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 x
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 y
LINE Normal 0 32 0 64
LINE Normal -8 32 0 22
LINE Normal 0 22 8 32
TEXT 0 -20 Center 1 AVG
LINE Normal -16 -6 -12 -9
LINE Normal -12 -9 -8 -6
LINE Normal -8 -6 -4 -3
LINE Normal -4 -3 0 -6
LINE Normal 0 -6 4 -9
LINE Normal 4 -9 8 -6
LINE Normal 8 -6 12 -3
LINE Normal 12 -3 16 -6
LINE Normal -16 2 -12 -1
LINE Normal -12 -1 -8 2
LINE Normal -8 2 -4 5
LINE Normal -4 5 0 2
LINE Normal 0 2 4 -1
LINE Normal 4 -1 8 2
LINE Normal 8 2 12 5
LINE Normal 12 5 16 2
LINE Normal -16 10 -12 7
LINE Normal -12 7 -8 10
LINE Normal -8 10 -4 13
LINE Normal -4 13 0 10
LINE Normal 0 10 4 7
LINE Normal 4 7 8 10
LINE Normal 8 10 12 13
LINE Normal 12 13 16 10
LINE Normal -8 14 8 -10
LINE Normal -74 -4 -68 0
LINE Normal -68 0 -74 4
LINE Normal 70 -4 76 0
LINE Normal 76 0 70 4
LINE Normal 4 58 0 52
LINE Normal 0 52 -4 58
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n K=3 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_movavg
SYMATTR ModelFile dsp_movavg.sub
SYMATTR Description Verilog module dsp_movavg
PIN 0 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -80 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 2
PIN 80 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
