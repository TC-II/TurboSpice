Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 q
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 bit
LINE Normal 0 48 0 80
LINE Normal -8 48 0 38
LINE Normal 0 38 8 48
TEXT 0 -34 Center 2 LFSR
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n SEED=44257
SYMATTR Prefix X
SYMATTR Value dsp_lfsr
SYMATTR ModelFile dsp_lfsr.sub
SYMATTR Description Verilog module dsp_lfsr
PIN 0 80 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 80 -16 NONE 0
PINATTR PinName q[15:0]
PINATTR SpiceOrder 2
PIN 80 16 NONE 0
PINATTR PinName prbs
PINATTR SpiceOrder 3
