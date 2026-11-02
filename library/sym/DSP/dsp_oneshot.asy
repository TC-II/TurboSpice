Version 4
SymbolType CELL
RECTANGLE Normal -64 -32 64 32
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 trig
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 q
LINE Normal 0 32 0 64
LINE Normal -8 32 0 22
LINE Normal 0 22 8 32
TEXT 0 -20 Center 2 1-shot
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n N=16
SYMATTR Prefix X
SYMATTR Value dsp_oneshot
SYMATTR ModelFile dsp_oneshot.sub
SYMATTR Description Verilog module dsp_oneshot
PIN 0 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -80 0 NONE 0
PINATTR PinName trig
PINATTR SpiceOrder 2
PIN 80 0 NONE 0
PINATTR PinName q
PINATTR SpiceOrder 3
