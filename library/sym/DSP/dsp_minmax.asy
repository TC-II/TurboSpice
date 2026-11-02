Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 -16 -64 -16
TEXT -58 -16 Left 1 a
LINE Normal -80 16 -64 16
TEXT -58 16 Left 1 b
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 mn
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 mx
TEXT 0 -34 Center 2 min max
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16
SYMATTR Prefix X
SYMATTR Value dsp_minmax
SYMATTR ModelFile dsp_minmax.sub
SYMATTR Description Verilog module dsp_minmax
PIN -80 -16 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN -80 16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN 80 -16 NONE 0
PINATTR PinName mn[15:0]
PINATTR SpiceOrder 3
PIN 80 16 NONE 0
PINATTR PinName mx[15:0]
PINATTR SpiceOrder 4
