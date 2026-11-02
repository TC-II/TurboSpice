Version 4
SymbolType CELL
RECTANGLE Normal -32 -32 32 32
LINE Normal -8 32 0 22
LINE Normal 0 22 8 32
LINE Normal 0 32 0 64
LINE Normal -64 0 -32 0
TEXT 0 -4 Center 3 ↑L
LINE Normal 32 0 64 0
LINE Normal 0 -32 0 -64
WINDOW 0 40 -40 Left 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n L=4 W=16
SYMATTR Prefix X
SYMATTR Value dsp_upsample
SYMATTR ModelFile dsp_upsample.sub
SYMATTR Description Verilog module dsp_upsample
PIN 0 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -64 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 2
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
PIN 0 -64 NONE 0
PINATTR PinName clko
PINATTR SpiceOrder 4
