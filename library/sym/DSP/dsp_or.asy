Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 -16 -64 -16
TEXT -58 -16 Left 1 a
LINE Normal -80 16 -64 16
TEXT -58 16 Left 1 b
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 y
TEXT 0 -34 Center 2 ≥1
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_or
SYMATTR ModelFile dsp_or.sub
SYMATTR Description Verilog module dsp_or
PIN -80 -16 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN -80 16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN 80 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
