Version 4
SymbolType CELL
RECTANGLE Normal -32 -24 32 24
LINE Normal -64 0 -32 0
LINE Normal 32 0 64 0
TEXT 0 0 Center 3 ÷N
WINDOW 0 0 -32 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n N=8
SYMATTR Prefix X
SYMATTR Value dsp_clkdiv
SYMATTR ModelFile dsp_clkdiv.sub
SYMATTR Description Verilog module dsp_clkdiv
PIN -64 0 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName clko
PINATTR SpiceOrder 2
