Version 4
SymbolType CELL
RECTANGLE Normal -32 -32 32 32
LINE Normal -8 32 0 22
LINE Normal 0 22 8 32
LINE Normal 0 32 0 64
TEXT 0 -10 Center 3 NCO
LINE Normal 32 0 64 0
LINE Normal -16 14 -12 10
LINE Normal -12 10 -8 8
LINE Normal -8 8 -4 10
LINE Normal -4 10 0 14
LINE Normal 0 14 4 18
LINE Normal 4 18 8 20
LINE Normal 8 20 12 18
LINE Normal 12 18 16 14
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n FREQ=1024
SYMATTR Prefix X
SYMATTR Value dsp_nco
SYMATTR ModelFile dsp_nco.sub
SYMATTR Description Verilog module dsp_nco
PIN 0 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 2
